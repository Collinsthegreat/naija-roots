// Game flow for ROOTS 3D: the controller between the rules (game.js), the
// board, the effects, the storyteller, the plaza, the HUD (ui.js), saved
// progress (progress.js) and the start.ng leaderboard (NOTES §7).
//
//   Daily:   one run per mode per UTC date. Every action is saved as it
//            happens and replayed on load, so a refresh resumes the run and a
//            finished Daily can't be played again.
//   Endless: rounds chain with Next; the streak grows on a win and resets on
//            a loss. The round in progress is saved the same way, so a refresh
//            can't dodge a loss.
//
// Clicks call these actions directly; the board's tap callback runs inside
// the sim step. Nothing here reads the clock (the date comes in from main.js).

import { createRun, answersFor, CLUE_COSTS, CLUE_CATEGORIES, MAX_GUESSES } from './game.js';
import { ZONES, STATE_BY_ID } from './data/nigeria.js';
import { TRIBE_BY_ID, cultureOf as tribeCulture } from './data/tribes.js';
import { COUNTRY_BY_ID, REGIONS, cultureOf as countryCulture } from './data/africa.js';
import { haversineKm } from './game.js';
import { normaliseStyle, submitRun, submitBlocked, fetchLeaderboard, isOwnEntry, bridgeAvailable, isStartNgHost, isGuestLaunch, goToSignIn, LEADERBOARD_COLUMNS } from './startng.js';
import { resetMemoryStorage, storageKind } from './storage.js';
import {
  loadStats, saveStats, currentDailyStreak, recordDailyWin, recordDailyLoss, recordEndless,
  leaderboardStats, dailyKey, endlessKey, loadRunLog, saveRunLog, CLUE_ACTION,
} from './progress.js';
import { createUI } from './ui.js';

const LOOKUP = { naija: TRIBE_BY_ID, africa: COUNTRY_BY_ID };
const CULTURE = { naija: tribeCulture, africa: countryCulture };
const GROUP_NAMES = {
  naija: Object.fromEntries(ZONES.map((z) => [z.id, z.name])),
  africa: Object.fromEntries(REGIONS.map((r) => [r.id, r.name])),
};
const GROUPS = { naija: ZONES.map((z) => ({ id: z.id, name: z.name })), africa: REGIONS.map((r) => ({ id: r.id, name: r.name })) };
const REFUSALS = {
  unaffordable: 'Not enough battery for that clue.',
  'all-unlocked': 'Every clue is already open.',
  repeat: 'You already tried that one.',
  unknown: 'Pick a tribe or country from the list.',
  over: 'This run is over.',
};

function groupsOf(mode, origin) {
  return mode === 'naija' ? origin.zones : [origin.region];
}

// The tile a guess flies to: a country's own tile, or for a tribe the state
// in its homeland nearest the tribe's centre.
function homeTile(mode, origin) {
  if (mode === 'africa') return origin.id;
  let best = origin.states[0];
  let bestKm = Infinity;
  for (const sid of origin.states) {
    const km = haversineKm(origin, STATE_BY_ID[sid]);
    if (km < bestKm) {
      bestKm = km;
      best = sid;
    }
  }
  return best;
}

// ctx: { board, fx, storyteller, plaza, date, capture, getPlayer, demo }
// demo (the ?capture showcase only): { targets: { naija: 'tiv' }, winHold: seconds }
export function createFlow(ctx) {
  const { board, fx, storyteller, plaza, date, capture, getPlayer, demo = null } = ctx;

  let mode = 'naija';
  let kind = 'daily';
  let stats = loadStats();
  let run = null;
  let log = null;
  let logKey = null;
  let selection = null; // answer id chosen, waiting for Confirm
  let pickedTile = null; // Naija: the state tile tapped
  let animating = false; // a guess sequence is playing
  let shownGuesses = 0; // guesses whose result has landed (history, battery)
  let batteryBeforeGuess = null;
  let streakBeforeGuess = null; // the stats are saved at confirm; the HUD waits for the landing
  let award = null; // plaza award of the finished run
  let submit = null; // { state, text } leaderboard status of the finished run
  let endOpen = false;

  const ui = createUI({
    onMode: (m) => setMode(m),
    onKind: (k) => setKind(k),
    onUnlock: () => unlockClue(),
    onChoose: (id) => choose(id),
    onConfirm: () => confirm(),
    onClearSelection: () => clearSelection(),
    onNext: () => next(),
    onPlayEndless: () => setKind('endless'),
    onShowResults: () => showEnd(),
    onCloseEnd: () => {
      endOpen = false;
      ui.hideEnd();
    },
    onTour: () => toggleTour(),
    onSignIn: () => goToSignIn(),
    loadLeaderboard: () => loadLeaderboard(),
    answers: () => answerList(),
  }, { capture });

  // --- helpers ------------------------------------------------------------------

  const origin = (id) => LOOKUP[mode][id] ?? null;
  const playing = () => run && run.status === 'playing' && !animating;

  function answerList() {
    const tiers = Object.fromEntries(run.guesses.slice(0, shownGuesses).map((g) => [g.id, g.tier]));
    return {
      mode,
      noun: mode === 'naija' ? 'tribe' : 'country',
      groups: GROUPS[mode],
      items: answersFor(mode)
        .map((o) => ({
          id: o.id,
          name: o.name,
          altNames: o.altNames,
          groups: groupsOf(mode, o),
          groupLabel: groupsOf(mode, o).map((g) => GROUP_NAMES[mode][g]).join(' · '),
          states: mode === 'naija' ? o.states : null,
          tier: tiers[o.id] ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'en')),
    };
  }

  function tileFor(o) {
    if (mode === 'naija' && pickedTile && o.states.includes(pickedTile)) return pickedTile;
    return homeTile(mode, o);
  }

  function save() {
    saveRunLog(logKey, log);
  }

  // --- runs -----------------------------------------------------------------------

  // Builds the run for the current mode + kind and replays its saved actions.
  function openRun() {
    fx.clear();
    plaza.stopTour(false);
    selection = null;
    pickedTile = null;
    animating = false;
    award = null;
    submit = null;
    endOpen = false;
    batteryBeforeGuess = null;
    streakBeforeGuess = null;
    ui.closePicker();
    ui.hideEnd();
    ui.resetClueScroll();
    if (board.mode !== mode) board.setMode(mode);
    else board.resetView();

    if (kind === 'daily') {
      logKey = dailyKey(mode, date);
      log = loadRunLog(logKey) ?? { actions: [], tiles: [], round: 0, exclude: [] };
      run = createRun({ mode, kind: 'daily', dateString: date, targetId: demo?.targets?.[mode] ?? null });
    } else {
      logKey = endlessKey(mode);
      const round = stats.endless[mode].round;
      const saved = loadRunLog(logKey);
      log = saved && saved.round === round ? saved : { actions: [], tiles: [], round, exclude: plaza.collected(mode) };
      run = createRun({ mode, kind: 'endless', seed: `roots3d:endless:${mode}:${round}`, exclude: log.exclude, streak: stats.endless[mode].streak });
    }

    // Replay in the original order (the battery depends on it). Anything the
    // rules refuse is dropped, so a damaged log can't break the run.
    const actions = [];
    const tiles = [];
    for (const a of log.actions) {
      if (a === CLUE_ACTION) {
        if (run.unlockClue().ok) actions.push(a);
      } else if (run.guess(a).ok) {
        tiles.push(log.tiles[tiles.length] ?? homeTile(mode, origin(a)));
        actions.push(a);
      }
    }
    log.actions = actions;
    log.tiles = tiles;
    save();
    shownGuesses = run.guesses.length;

    // A new mystery: silhouette in the new culture, snapped (no fade from the
    // last answer's full colours, which would give it away).
    storyteller.setTarget(CULTURE[mode](run.target));
    storyteller.setRevealStage(run.status === 'playing' ? run.cluesUnlocked : 8);
    storyteller.reset();

    // Put back the flags, tints and arcs of guesses made before a refresh.
    run.guesses.forEach((g, i) => {
      const tile = log.tiles[i];
      fx.plantFlag(tile, getPlayer());
      fx.markTile(tile, g.tier);
      if (g.tier !== 'green') fx.trajectoryArc(tile, g, g.tier, getPlayer());
    });
    if (run.status === 'won') award = plaza.award(mode, run.target.id);
    render();
  }

  function setMode(m) {
    if (m === mode || animating || !LOOKUP[m]) return;
    mode = m;
    openRun();
  }

  function setKind(k) {
    if (k === kind || animating || (k !== 'daily' && k !== 'endless')) return;
    kind = k;
    openRun();
  }

  // Endless: start the next round once this one is over.
  function next() {
    if (kind !== 'endless' || !run || run.status === 'playing' || animating) return;
    stats.endless[mode].round += 1;
    saveStats(stats);
    openRun();
  }

  // --- actions ---------------------------------------------------------------------

  function unlockClue() {
    if (!playing()) return false;
    const r = run.unlockClue();
    if (!r.ok) {
      ui.toast(REFUSALS[r.reason] ?? 'That clue is locked.');
      return false;
    }
    log.actions.push(CLUE_ACTION);
    save();
    storyteller.setRevealStage(run.cluesUnlocked);
    ui.flipClue(r.index);
    render();
    return true;
  }

  // A tile was tapped (runs inside the sim step).
  function onTile(tileId) {
    if (!playing() || board.transitioning) return;
    if (mode === 'naija') {
      const state = STATE_BY_ID[tileId];
      if (!state) return;
      pickedTile = tileId;
      board.focusRegion(tileId);
      const list = answerList();
      ui.openPicker({
        title: state.name,
        subtitle: GROUP_NAMES.naija[state.zone],
        items: list.items.filter((it) => it.states.includes(tileId)),
      });
    } else {
      const c = COUNTRY_BY_ID[tileId];
      if (!c) return;
      if (run.guesses.some((g) => g.id === tileId)) {
        ui.toast(`${c.name}: ${REFUSALS.repeat}`);
        return;
      }
      choose(tileId);
    }
  }

  // An answer was chosen (picker, drawer or an Africa tile): it waits for Confirm.
  function choose(id) {
    const o = origin(id);
    if (!o || !playing()) return;
    if (run.guesses.some((g) => g.id === id)) {
      ui.toast(`${o.name}: ${REFUSALS.repeat}`);
      return;
    }
    selection = id;
    if (mode === 'naija' && !(pickedTile && o.states.includes(pickedTile))) pickedTile = homeTile(mode, o);
    board.focusRegion(mode === 'naija' ? pickedTile : id);
    ui.closePicker();
    render();
  }

  function clearSelection() {
    selection = null;
    pickedTile = null;
    ui.closePicker();
    board.resetView();
    render();
  }

  // Locks in the selected answer and plays the guess sequence.
  function confirm() {
    if (!playing() || !selection) return false;
    const o = origin(selection);
    const tile = tileFor(o);
    const before = run.battery;
    const result = run.guess(selection);
    if (!result.ok) {
      ui.toast(REFUSALS[result.reason] ?? 'That guess was not accepted.');
      return false;
    }
    log.actions.push(selection);
    log.tiles.push(tile);
    const streakBefore = streakNow();
    if (run.status !== 'playing') recordResult(); // stats first, then the log
    save();
    selection = null;
    pickedTile = null;
    animating = true;
    batteryBeforeGuess = before;
    streakBeforeGuess = streakBefore;
    ui.closePicker();
    render();

    const landed = () => {
      shownGuesses = run.guesses.length;
      batteryBeforeGuess = null;
      streakBeforeGuess = null;
      ui.toastGuess({ ...result, name: o.name });
      render();
    };
    const done = () => {
      animating = false;
      if (run.status === 'won') award = plaza.award(mode, run.target.id);
      if (run.status === 'lost') storyteller.setRevealStage(8);
      if (run.status !== 'playing') showEnd();
      render();
    };
    const hold = result.tier === 'green' ? demo?.winHold ?? null : null;
    const started = fx.playGuess({ ...result, id: tile }, getPlayer(), { onLand: landed, onDone: done, hold });
    if (!started) {
      landed();
      done();
    }
    return true;
  }

  // --- results and the leaderboard ----------------------------------------------------

  function recordResult() {
    const won = run.status === 'won';
    if (kind === 'daily') {
      if (won) recordDailyWin(stats, date, run.battery);
      else recordDailyLoss(stats);
    } else {
      recordEndless(stats, mode, won);
    }
    saveStats(stats);
    if (won || kind === 'daily') submitResult(); // NOTES §7: every win and a Daily loss
  }

  // Sends the run through startng.js (which refuses capture, offline and
  // guests, and queues nothing). The result shows on the end screen, in the
  // HUD status badge and, once it is back, as a toast. Never blocks play.
  function submitResult() {
    if (capture) {
      submit = null; // decided now, so capture frames never wait on a promise
      return;
    }
    const player = getPlayer();
    const blocked = submitBlocked(player);
    if (blocked) {
      submit = submitStatus(blocked); // offline / guest: known now, no "Saving…" flash
      return;
    }
    submit = { state: 'saving', text: 'Saving to the leaderboard…' };
    submitRun(leaderboardStats(stats, date), player).then((r) => {
      submit = submitStatus(r);
      if (submit?.toast) ui.toast(submit.toast, { tier: r.state === 'submitted' ? 'green' : null });
      render();
    });
  }

  function submitStatus(r) {
    switch (r.state) {
      case 'disabled': return null;
      case 'offline': return { state: 'offline', text: `${r.message}.` };
      // A player who chose "guest" on start.ng (?guest) gets no sign-in nudge (NOTES §4).
      case 'guest': return { state: 'guest', text: isGuestLaunch() ? 'Playing as a guest: scores are kept for signed-in players.' : 'Sign in on start.ng to put your score on the leaderboard.' };
      case 'submitted': {
        const rank = r.rank ? ` You're #${r.rank}.` : '';
        const text = r.improved ? `New best saved to the leaderboard!${rank}` : `Saved. Your best run on the board is still higher.${rank}`;
        return { state: 'saved', text, toast: r.improved ? `New best on the leaderboard!${rank}` : 'Score sent to the leaderboard.' };
      }
      default: return { state: 'error', text: `Not saved: ${r.message || 'start.ng did not answer'}.`, toast: 'The score could not be saved.' };
    }
  }

  // The small HUD badge: where scores go right now (null in capture mode).
  function syncBadge() {
    if (capture) return null;
    const player = getPlayer();
    if (!bridgeAvailable()) return { state: 'offline', text: 'Offline', title: 'Scores save once the game is live on start.ng' };
    if (player.source === 'offline') return { state: 'offline', text: 'Offline', title: "start.ng didn't answer, so scores can't be saved right now" };
    if (player.source !== 'user') return { state: 'guest', text: 'Guest', title: 'Sign in to save your score' };
    if (submit?.state === 'saving') return { state: 'saving', text: 'Saving…', title: 'Sending your run to start.ng' };
    if (submit?.state === 'saved') return { state: 'saved', text: 'Saved', title: submit.text };
    if (submit?.state === 'error') return { state: 'error', text: 'Not saved', title: submit.text };
    return { state: 'ready', text: 'Signed in', title: 'Wins are saved to the start.ng leaderboard' };
  }

  // --- leaderboard panel ------------------------------------------------------------------

  // Reads the board (guests can read it too). Resolves to what the panel shows.
  async function loadLeaderboard() {
    const player = getPlayer();
    const local = leaderboardStats(stats, date);
    const base = { columns: LEADERBOARD_COLUMNS, local, isGuest: player.source !== 'user', canSignIn: player.source === 'guest' && isStartNgHost() && !capture && !isGuestLaunch() };
    if (capture) return { ...base, ok: false, offline: true, entries: [], error: 'The leaderboard is not loaded in capture mode.' };
    const r = await fetchLeaderboard(20);
    return { ...base, ok: r.ok, offline: Boolean(r.offline), error: r.error ?? null, entries: r.entries.map((e) => ({ ...e, own: isOwnEntry(e, player) })) };
  }

  function showEnd() {
    if (!run || run.status === 'playing' || animating) return;
    endOpen = true;
    render();
  }

  function toggleTour() {
    if (plaza.touring) plaza.stopTour(true);
    else if (!plaza.tour({ onEnd: render })) ui.toast('Solve an origin to start your Heritage Plaza.');
    render();
  }

  // --- the HUD view --------------------------------------------------------------------

  function streakNow() {
    return kind === 'daily' ? currentDailyStreak(stats, date) : stats.endless[mode].streak;
  }

  function view() {
    const player = getPlayer();
    const style = normaliseStyle(player.style);
    const ended = run.status !== 'playing' && !animating;
    const shown = run.guesses.slice(0, shownGuesses);
    const t = run.target;
    const sel = selection ? origin(selection) : null;
    return {
      mode,
      kind,
      date,
      battery: batteryBeforeGuess ?? run.battery,
      guessesLeft: MAX_GUESSES - shown.length,
      maxGuesses: MAX_GUESSES,
      streak: streakBeforeGuess ?? streakNow(),
      streakLabel: kind === 'daily' ? 'Daily streak' : 'Endless streak',
      busy: animating,
      // Where the explorer is in a guess sequence: flying out (result hidden),
      // or heading back after a miss or a win (result shown at the landing).
      trip: !animating ? null : shownGuesses < run.guesses.length ? 'out' : run.status === 'won' ? 'won' : 'back',
      status: animating ? 'playing' : run.status,
      noun: mode === 'naija' ? 'tribe' : 'country',
      player: {
        name: player.name,
        primary: style.primaryColor,
        secondary: style.secondaryColor,
        isGuest: player.isGuest,
        canSignIn: player.source === 'guest' && isStartNgHost() && !capture,
      },
      clues: CLUE_CATEGORIES.map((category, i) => ({
        index: i,
        category,
        cost: CLUE_COSTS[i],
        open: ended || i < run.cluesUnlocked,
        text: ended || i < run.cluesUnlocked ? t.clues[i] : null,
        next: !ended && i === run.cluesUnlocked,
        affordable: run.battery >= CLUE_COSTS[i],
      })),
      cluesOpen: ended ? CLUE_CATEGORIES.length : run.cluesUnlocked,
      history: shown.map((g) => ({ name: origin(g.id).name, tier: g.tier, distanceKm: g.distanceKm, bearing: g.bearing })),
      selection: sel ? { id: sel.id, name: sel.name, where: mode === 'naija' ? STATE_BY_ID[pickedTile]?.name : GROUP_NAMES.africa[sel.region] } : null,
      plaza: { size: plaza.size, touring: plaza.touring },
      sync: syncBadge(),
      end: ended
        ? {
          open: endOpen,
          won: run.status === 'won',
          kind,
          answer: { name: t.name, groupLabel: groupsOf(mode, t).map((g) => GROUP_NAMES[mode][g]).join(' · ') },
          clues: CLUE_CATEGORIES.map((category, i) => ({ category, text: t.clues[i] })),
          score: run.score,
          guesses: run.guesses.length,
          streak: kind === 'daily' ? currentDailyStreak(stats, date) : stats.endless[mode].streak,
          streakLabel: kind === 'daily' ? 'Daily streak' : 'Endless streak',
          solved: stats.solved,
          award: award ? { name: award.name, isNew: award.isNew, shown: award.shown !== false } : null,
          submit,
        }
        : null,
    };
  }

  function render() {
    if (run) ui.render(view());
  }

  // --- wiring --------------------------------------------------------------------------

  board.onPick((id) => onTile(id));

  // Runs inside the fixed sim step (HUD animations are sim-timed too).
  function update(dt) {
    ui.update(dt);
  }

  // Capture replays from 0: forget the in-memory progress and start again.
  function reset() {
    resetMemoryStorage();
    stats = loadStats();
    plaza.reset();
    mode = 'naija';
    kind = 'daily';
    ui.reset();
    openRun();
  }

  openRun();
  if (!capture && storageKind() === 'memory') {
    ui.toast('This browser is blocking storage, so progress lasts until you close the page. You can still play.', { time: 8 });
  }

  return {
    // Actions (the HUD calls these; capture.js can script them).
    setMode,
    setKind,
    unlockClue,
    tapTile: onTile,
    choose,
    confirm,
    clearSelection,
    next,
    tour: toggleTour,
    showEnd,
    // Re-render after the player changes (sign-in, style update).
    refresh: render,
    update,
    reset,
    get mode() {
      return mode;
    },
    get kind() {
      return kind;
    },
    get run() {
      return run;
    },
    get busy() {
      return animating;
    },
  };
}
