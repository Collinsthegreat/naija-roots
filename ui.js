// The HUD for ROOTS 3D, in the slots index.html provides:
//   #top-bar     title, mode toggle, Daily / Endless toggle, battery meter,
//                guesses left, streak, Plaza button, player chip
//   #clue-panel  guess history + 8 clue cards (a bottom sheet on phones)
//   #guess-bar   what to do next, the current selection and Confirm
//   #drawer      the finder (ui-pick.js); #picker sits above the guess bar
//   #toast-layer guess results and notes; #modal-layer the end screen
//
// flow.js owns the state and calls render(view) after every change. Every
// HUD animation (battery drain, clue card flips, toast lifetimes) advances in
// update(dt) inside the fixed sim step, not in CSS transitions, so capture
// frames are deterministic. Handlers are flow.js actions.

import { h, createStatePicker, createFinder } from './ui-pick.js';
import { createLeaderboardPanel } from './ui-leaderboard.js';

const BATTERY_MAX = 10000;
const FLIP_TIME = 0.5;
const TOAST_TIME = 3.2;
const GUESS_TOAST_TIME = 4.2;
const MAX_TOASTS = 3;
const ARROWS = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
// Guess-bar text while a guess plays (view.trip).
const TRIP_TEXT = {
  out: 'Your explorer is on the way…',
  back: 'Your explorer is heading back…',
  won: 'Found it! Your explorer is heading home…',
};
const TIER_TEXT = {
  naija: { green: 'Found it!', cyan: 'Shares a state', yellow: 'Same zone', red: 'Far off' },
  africa: { green: 'Found it!', cyan: 'Shares a border', yellow: 'Same region', red: 'Far off' },
};

function groupDigits(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Moves a toward a lower b: exponential, but never slower than minRate per
// second, so small drains finish quickly too. Rises jump straight to b.
function drain(a, b, lambda, minRate, dt) {
  if (b >= a) return b;
  const step = Math.max((a - b) * (1 - Math.exp(-lambda * dt)), minRate * dt);
  return Math.max(b, a - step);
}

// options: [value, text, shortText?]; the short text shows on phones.
function segmented(label, options, onPick) {
  const group = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const buttons = options.map(([value, text, short]) => {
    const b = short
      ? h('button', { type: 'button', 'data-value': value, 'aria-pressed': 'false', 'aria-label': text },
        h('span', { class: 'long', text }), h('span', { class: 'short', text: short }))
      : h('button', { type: 'button', 'data-value': value, 'aria-pressed': 'false', text });
    b.addEventListener('click', () => onPick(value));
    group.append(b);
    return b;
  });
  return {
    el: group,
    set(value, disabled) {
      for (const b of buttons) {
        b.setAttribute('aria-pressed', String(b.dataset.value === value));
        b.disabled = disabled;
      }
    },
  };
}

export function createUI(handlers, { capture = false } = {}) {
  const $ = (id) => document.getElementById(id);
  const hud = $('hud');
  const topBar = $('top-bar');
  const cluePanel = $('clue-panel');
  const guessBar = $('guess-bar');
  const drawer = $('drawer');
  const toastLayer = $('toast-layer');
  const modalLayer = $('modal-layer');
  if (capture) document.documentElement.classList.add('capture'); // no CSS transitions

  let current = null; // the last view
  let mode = null;

  // --- top bar ------------------------------------------------------------------

  const modeSeg = segmented('Game mode', [['naija', 'Naija Heritage', 'Naija'], ['africa', 'Africa 54']], (v) => handlers.onMode(v));
  const kindSeg = segmented('Run', [['daily', 'Daily'], ['endless', 'Endless']], (v) => handlers.onKind(v));
  const batteryFill = h('div', { class: 'battery-fill' });
  const batteryGhost = h('div', { class: 'battery-ghost' });
  const batteryNum = h('span', { class: 'battery-num' });
  const battery = h('div', { class: 'battery', role: 'meter', 'aria-label': 'Expedition battery', 'aria-valuemin': '0', 'aria-valuemax': String(BATTERY_MAX) },
    h('span', { class: 'battery-cap', 'aria-hidden': 'true' }),
    h('div', { class: 'battery-track' }, batteryGhost, batteryFill),
    batteryNum);
  const pips = h('div', { class: 'pips', role: 'img' });
  const streak = h('div', { class: 'streak' });
  // Text on desktop, a drawn icon on phones (the accessible name stays).
  const plazaLabel = h('span', { class: 'btn-label' });
  const plazaBtn = h('button', { type: 'button', class: 'pill-btn plaza-btn icon-able' }, h('span', { class: 'icon icon-plaza', 'aria-hidden': 'true' }), plazaLabel);
  plazaBtn.addEventListener('click', () => handlers.onTour());
  const chipDot = h('span', { class: 'chip-dot', 'aria-hidden': 'true' });
  const chipName = h('span', { class: 'chip-name' });
  const signIn = h('button', { type: 'button', class: 'link-btn', text: 'Sign in' });
  signIn.addEventListener('click', () => handlers.onSignIn());
  const chip = h('div', { class: 'player-chip' }, chipDot, chipName, signIn);
  // Where scores go right now: Offline / Guest / Saving… / Saved / Not saved.
  const sync = h('span', { class: 'sync-badge', role: 'status' });
  sync.hidden = true;
  const boardBtn = h('button', { type: 'button', class: 'pill-btn icon-able', 'aria-label': 'Leaderboard' },
    h('span', { class: 'icon icon-board', 'aria-hidden': 'true' }), h('span', { class: 'btn-label', text: 'Leaderboard' }));
  boardBtn.addEventListener('click', () => {
    if (leaderboard.isOpen) leaderboard.close();
    else {
      picker.close();
      leaderboard.open();
    }
  });

  topBar.replaceChildren(
    h('div', { class: 'tb-group panel' }, h('div', { class: 'brand' }, h('b', { text: 'ROOTS' }), ' 3D'), modeSeg.el, kindSeg.el),
    h('div', { class: 'tb-group panel tb-stats' }, battery, pips, streak, plazaBtn, boardBtn, chip, sync),
  );

  // --- clue panel -------------------------------------------------------------------

  const sheetToggle = h('button', { type: 'button', class: 'sheet-toggle', 'aria-expanded': 'true' });
  sheetToggle.addEventListener('click', () => {
    const collapsed = cluePanel.classList.toggle('collapsed');
    sheetToggle.setAttribute('aria-expanded', String(!collapsed));
  });
  const history = h('ol', { class: 'history', 'aria-label': 'Your guesses' });
  const cardList = h('ol', { class: 'clue-list' });
  const cards = Array.from({ length: 8 }, (_, i) => {
    const lockedFace = h('div', { class: 'face face-locked' });
    const openFace = h('div', { class: 'face face-open' });
    const li = h('li', { class: 'clue', 'data-state': i === 0 ? 'open' : 'locked' }, lockedFace, openFace);
    cardList.append(li);
    return { li, lockedFace, openFace, key: '' };
  });
  cluePanel.replaceChildren(h('header', { class: 'cp-head' }, sheetToggle), history, cardList);

  const flips = new Map(); // card index → progress 0..1

  // "Greeting/Proverb/Language" has no break point (browsers don't wrap at a
  // slash), so it would push the card wider than the panel. A <wbr> after each
  // slash lets it wrap there instead.
  const slashBreaks = (text) => text.split('/').flatMap((part, k, all) => (k < all.length - 1 ? [`${part}/`, h('wbr')] : [part]));

  function drawCard(i, c) {
    const card = cards[i];
    const key = `${c.open}|${c.next}|${c.affordable}|${c.text}|${current?.busy}|${current?.status}`;
    if (card.key === key) return;
    card.key = key;
    const head = (extra) => h('div', { class: 'clue-head' }, h('span', { class: 'clue-num', text: String(i + 1) }), h('span', { class: 'clue-cat' }, slashBreaks(c.category)), extra);
    card.openFace.replaceChildren(head(i === 0 ? h('span', { class: 'clue-free', text: 'Free' }) : null), h('p', { class: 'clue-text', text: c.text ?? '' }));
    let action;
    if (c.next) {
      action = h('button', { type: 'button', class: 'unlock-btn', disabled: !c.affordable || current?.busy, text: `Unlock · −${groupDigits(c.cost)}` });
      action.addEventListener('click', () => handlers.onUnlock());
    } else {
      action = h('span', { class: 'clue-cost', text: groupDigits(c.cost) });
    }
    // replaceChildren would print a null as the text "null": pass only real nodes.
    const short = c.next && !c.affordable ? [h('p', { class: 'muted small', text: 'Not enough battery' })] : [];
    card.lockedFace.replaceChildren(head(action), ...short);
    if (!flips.has(i)) card.li.dataset.state = c.open ? 'open' : 'locked';
    card.li.classList.toggle('is-next', c.next);
  }

  function drawHistory(list) {
    history.replaceChildren(...list.map((g) => h('li', { class: `guess tier-${g.tier}` },
      h('span', { class: 'guess-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'guess-name', text: g.name }),
      h('span', { class: 'guess-meta', text: g.tier === 'green' ? TIER_TEXT[mode].green : `${groupDigits(g.distanceKm)} km ${ARROWS[g.bearing] ?? ''} ${g.bearing ?? ''}` }))));
    history.hidden = list.length === 0;
  }

  // --- guess bar ------------------------------------------------------------------

  function button(text, cls, onClick, disabled = false) {
    const b = h('button', { type: 'button', class: cls, text, disabled });
    b.addEventListener('click', onClick);
    return b;
  }

  // A guess-bar button whose label shortens on phones (CSS .long / .short), so
  // the bar's text keeps room. aria-label keeps the full name; data-action is a
  // stable handle that doesn't depend on which label shows.
  function barButton(long, short, action, cls, onClick) {
    const b = h('button', { type: 'button', class: cls, 'aria-label': long, 'data-action': action },
      h('span', { class: 'long', text: long }), h('span', { class: 'short', text: short }));
    b.addEventListener('click', onClick);
    return b;
  }

  function drawGuessBar(v) {
    const find = () => barButton(v.noun === 'tribe' ? 'Search tribes' : 'Search countries', 'Search', 'search', 'pill-btn', () => openFinder());
    let parts;
    if (v.status !== 'playing') {
      const msg = v.status === 'won' ? `Solved: ${v.end?.answer.name ?? ''}` : `The origin was ${v.end?.answer.name ?? ''}`;
      parts = [h('span', { class: 'gb-text', text: msg }), button('Results', 'pill-btn', () => handlers.onShowResults())];
      if (v.kind === 'endless') parts.push(barButton('Next origin', 'Next', 'next', 'primary-btn', () => handlers.onNext()));
      else parts.push(barButton('Play Endless', 'Endless', 'endless', 'primary-btn', () => handlers.onPlayEndless()));
    } else if (v.busy) {
      parts = [h('span', { class: 'gb-text', text: TRIP_TEXT[v.trip] ?? TRIP_TEXT.out })];
    } else if (v.selection) {
      parts = [
        h('span', { class: 'gb-text' }, h('b', { text: v.selection.name }), v.selection.where ? ` · ${v.selection.where}` : ''),
        button('Change', 'pill-btn', () => handlers.onClearSelection()),
        barButton('Confirm guess', 'Confirm', 'confirm', 'primary-btn', () => handlers.onConfirm()),
      ];
    } else {
      parts = [h('span', { class: 'gb-text', text: v.noun === 'tribe' ? 'Tap a state on the map' : 'Tap a country on the map' }), find()];
    }
    guessBar.replaceChildren(...parts);
  }

  // --- toasts ------------------------------------------------------------------------

  const toasts = []; // { el, life, total }

  function toast(text, { tier = null, time = TOAST_TIME } = {}) {
    const el = h('div', { class: `toast${tier ? ` tier-${tier}` : ''}`, role: 'status' }, text);
    toastLayer.append(el);
    toasts.push({ el, life: time, total: time });
    while (toasts.length > MAX_TOASTS) toasts.shift().el.remove();
  }

  function toastGuess(r) {
    const words = TIER_TEXT[mode][r.tier];
    const where = r.tier === 'green' ? '' : ` · ${groupDigits(r.distanceKm)} km ${ARROWS[r.bearing] ?? ''} ${r.bearing ?? ''}`;
    toast(h('span', {}, h('b', { text: r.name }), ` · ${words}${where}`), { tier: r.tier, time: GUESS_TOAST_TIME });
  }

  // --- pickers -------------------------------------------------------------------------

  const picker = createStatePicker(hud, {
    onChoose: (id) => handlers.onChoose(id),
    onFindAll: () => openFinder(),
    onClose: () => handlers.onClearSelection(),
  });
  const finder = createFinder(drawer, {
    onChoose: (id) => {
      finder.close();
      handlers.onChoose(id);
    },
    onClose: () => finder.close(),
  });

  const leaderboard = createLeaderboardPanel(drawer, {
    load: () => handlers.loadLeaderboard(),
    onSignIn: () => handlers.onSignIn(),
    onClose: () => leaderboard.close(),
  });

  function openFinder() {
    picker.close();
    finder.open(handlers.answers());
  }

  // --- end screen ------------------------------------------------------------------------

  function drawEnd(e) {
    const stat = (label, value) => h('div', { class: 'end-stat' }, h('b', { text: value }), h('span', { text: label }));
    const actions = [];
    if (e.kind === 'endless') actions.push(button('Next origin', 'primary-btn', () => handlers.onNext()));
    else actions.push(h('p', { class: 'end-tomorrow', text: 'Come back tomorrow for a new Daily origin.' }), button('Play Endless', 'primary-btn', () => handlers.onPlayEndless()));
    actions.push(button('Close', 'pill-btn', () => handlers.onCloseEnd()));
    if (e.award?.isNew && e.award.shown) actions.push(button('Visit the Plaza', 'pill-btn', () => { handlers.onCloseEnd(); handlers.onTour(); }));

    const card = h('section', { class: `end-card ${e.won ? 'won' : 'lost'}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'end-title' },
      h('p', { class: 'end-kicker', text: e.won ? 'You found the origin!' : 'Out of guesses' }),
      h('h2', { id: 'end-title', class: 'end-answer', text: e.answer.name }),
      h('p', { class: 'muted', text: e.answer.groupLabel }),
      h('div', { class: 'end-stats' },
        stat(e.won ? 'Score (battery left)' : 'Score', groupDigits(e.score)),
        stat('Guesses', String(e.guesses)),
        stat(e.streakLabel, String(e.streak)),
        stat('Origins found', String(e.solved))),
      e.award ? h('p', { class: 'end-award', text: e.award.isNew ? `New for your Heritage Plaza: ${e.award.name}` : `Already in your Heritage Plaza: ${e.award.name}` }) : null,
      e.submit ? h('p', { class: `end-submit ${e.submit.state}`, text: e.submit.text }) : null,
      h('ol', { class: 'end-clues' }, e.clues.map((c, i) => h('li', {},
        h('span', { class: 'clue-num', text: String(i + 1) }),
        h('div', {}, h('b', { text: c.category }), h('p', { text: c.text }))))),
      h('div', { class: 'end-actions' }, actions));
    modalLayer.replaceChildren(card);
    card.querySelector('.primary-btn')?.focus({ preventScroll: true });
  }

  function hideEnd() {
    modalLayer.replaceChildren();
  }

  // --- render (after every state change) ---------------------------------------------------

  let batteryShown = null;
  let batteryGhostShown = null;
  let endKey = '';

  function render(v) {
    const first = current === null || v.mode !== current.mode || v.kind !== current.kind;
    current = v;
    mode = v.mode;
    modeSeg.set(v.mode, v.busy);
    kindSeg.set(v.kind, v.busy);
    if (first || batteryShown === null) {
      batteryShown = v.battery;
      batteryGhostShown = v.battery;
    }
    battery.setAttribute('aria-valuenow', String(v.battery));
    pips.replaceChildren(...Array.from({ length: v.maxGuesses }, (_, i) => h('span', { class: `pip${i < v.guessesLeft ? ' on' : ''}` })));
    pips.setAttribute('aria-label', `${v.guessesLeft} of ${v.maxGuesses} guesses left`);
    streak.replaceChildren(h('span', { class: 'streak-label' }, h('span', { class: 'long', text: v.streakLabel }), h('span', { class: 'short', text: 'Streak' })), h('b', { text: String(v.streak) }));
    streak.title = `${v.streakLabel}: ${v.streak}`;
    plazaLabel.textContent = v.plaza.touring ? 'Stop tour' : `Plaza · ${v.plaza.size}`;
    plazaBtn.setAttribute('aria-label', v.plaza.touring ? 'Stop the Plaza tour' : `Heritage Plaza, ${v.plaza.size} artifacts`);
    plazaBtn.disabled = v.busy;
    chipDot.style.background = v.player.primary;
    chipDot.style.borderColor = v.player.secondary;
    chipName.textContent = v.player.name;
    signIn.hidden = !v.player.canSignIn;
    sync.hidden = !v.sync;
    chip.dataset.sync = v.sync?.state ?? '';
    if (v.sync) {
      sync.textContent = v.sync.text;
      sync.title = v.sync.title;
      sync.dataset.state = v.sync.state;
    }

    sheetToggle.replaceChildren(h('b', { text: 'Clues' }), h('span', { class: 'muted', text: ` ${v.cluesOpen}/8 open` }));
    v.clues.forEach((c, i) => drawCard(i, c));
    drawHistory(v.history);
    drawGuessBar(v);
    if (finder.isOpen) finder.refresh(handlers.answers());

    if (v.end?.open) {
      const key = JSON.stringify(v.end);
      if (key !== endKey) {
        endKey = key;
        drawEnd(v.end);
      }
    } else if (endKey) {
      endKey = '';
      hideEnd();
    }
    if (v.busy || v.status !== 'playing') picker.close();
  }

  // --- sim-step animation -------------------------------------------------------------------

  function update(dt) {
    if (current && batteryShown !== null) {
      const target = current.battery;
      batteryShown = drain(batteryShown, target, 5, 600, dt);
      batteryGhostShown = drain(batteryGhostShown, target, 1.6, 250, dt);
      if (batteryGhostShown < batteryShown) batteryGhostShown = batteryShown;
      batteryFill.style.width = `${(batteryShown / BATTERY_MAX) * 100}%`;
      batteryGhost.style.width = `${(batteryGhostShown / BATTERY_MAX) * 100}%`;
      batteryNum.textContent = groupDigits(batteryShown);
      battery.classList.toggle('low', batteryShown < 2500);
      battery.classList.toggle('draining', batteryGhostShown - batteryShown > 1);
    }

    // Clue flips: shrink the locked face, swap, grow the open face.
    for (const [i, p0] of flips) {
      const p = Math.min(1, p0 + dt / FLIP_TIME);
      const card = cards[i].li;
      card.dataset.state = p < 0.5 ? 'locked' : 'open';
      card.style.transform = p >= 1 ? '' : `scaleY(${Math.max(0.02, Math.abs(1 - 2 * p)).toFixed(3)})`;
      if (p >= 1) flips.delete(i);
      else flips.set(i, p);
    }

    for (let k = toasts.length - 1; k >= 0; k--) {
      const t = toasts[k];
      t.life -= dt;
      const age = t.total - t.life;
      t.el.style.opacity = String(Math.min(1, age / 0.2, Math.max(0, t.life) / 0.4));
      if (t.life <= 0) {
        t.el.remove();
        toasts.splice(k, 1);
      }
    }
  }

  function flipClue(i) {
    flips.set(i, 0);
    cards[i].li.scrollIntoView?.({ block: 'nearest', behavior: capture ? 'auto' : 'smooth' });
  }

  // Back to a blank HUD (capture replays from 0).
  function reset() {
    for (const t of toasts) t.el.remove();
    toasts.length = 0;
    for (const [i] of flips) cards[i].li.style.transform = '';
    flips.clear();
    for (const c of cards) c.key = '';
    current = null;
    batteryShown = null;
    endKey = '';
    picker.close();
    finder.close();
    leaderboard.close();
    hideEnd();
  }

  // Escape closes the top-most layer.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modalLayer.childElementCount) handlers.onCloseEnd();
    else if (finder.isOpen) finder.close();
    else if (leaderboard.isOpen) leaderboard.close();
    else if (picker.isOpen) handlers.onClearSelection();
  });

  return {
    render,
    update,
    reset,
    toast: (text, opts) => toast(text, opts),
    toastGuess,
    flipClue,
    openPicker: (opts) => picker.open(opts),
    closePicker: () => picker.close(),
    hideEnd: () => {
      endKey = '';
      hideEnd();
    },
    // A new round starts with its free clue in view, not where the last one ended.
    resetClueScroll: () => {
      cluePanel.scrollTop = 0;
    },
  };
}
