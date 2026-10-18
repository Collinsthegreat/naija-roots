// Pure game logic for ROOTS 3D: battery, clues, guesses, feedback tiers and the
// Daily / Endless target choice, exactly as CLAUDE.md §5 describes.
// No three.js, no DOM and no clock: the Daily date string is passed in, and the
// Endless target comes from a seed, so every run is reproducible.
//
//   const run = createRun({ mode: 'naija', kind: 'daily', dateString: '2026-01-01' });
//   run.on('guessMade', (r) => ...);
//   run.unlockClue();          // { ok, index, text, cost, battery } or { ok: false, reason }
//   run.guess('hausa');        // { ok, tier, distanceKm, bearing, battery, ... }

import { hashString, mulberry32 } from './rng.js';
import { TRIBES, TRIBE_BY_ID } from './data/tribes.js';
import { COUNTRIES, COUNTRY_BY_ID } from './data/africa.js';

export const BATTERY_START = 10000;
export const CLUE_COSTS = Object.freeze([0, 250, 400, 600, 800, 1100, 1400, 1750]);
export const CLUE_CATEGORIES = Object.freeze([
  'Terrain & Climate',
  'Staple Food/Dish',
  'Traditional Attire/Craft/Music',
  'Greeting/Proverb/Language',
  'Festival/Cultural Rite',
  'Kingdom/History/Currency',
  'Geopolitical Zone/Subregion & Neighbours',
  'Paramount Ruler Title or Iconic Landmark',
]);
export const MAX_GUESSES = 3;
export const WRONG_GUESS_FACTOR = 0.7;
export const TIERS = Object.freeze(['green', 'cyan', 'yellow', 'red']);
export const MODES = Object.freeze(['naija', 'africa']);
export const RUN_KINDS = Object.freeze(['daily', 'endless']);

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const EARTH_RADIUS_KM = 6371;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Each dataset sorted by id (plain code-unit order, the same in every browser).
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const DATA = {
  naija: { list: Object.freeze([...TRIBES].sort(byId)), lookup: TRIBE_BY_ID },
  africa: { list: Object.freeze([...COUNTRIES].sort(byId)), lookup: COUNTRY_BY_ID },
};

function dataFor(mode) {
  const data = DATA[mode];
  if (!data) throw new Error(`game: unknown mode "${mode}"`);
  return data;
}

// The answers a mode can have (tribes or countries), sorted by id.
export function answersFor(mode) {
  return dataFor(mode).list;
}

// ---------------------------------------------------------------------------
// Geography helpers
// ---------------------------------------------------------------------------

const rad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in km between two { lat, lon } points (not rounded).
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Initial great-circle bearing from → to, in degrees clockwise from north [0, 360).
export function bearingDeg(from, to) {
  const p1 = rad(from.lat);
  const p2 = rad(to.lat);
  const dLon = rad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// 8-point compass direction from → to ('N', 'NE', … 'NW'); null for the same point.
export function bearing8(from, to) {
  if (from.lat === to.lat && from.lon === to.lon) return null;
  return COMPASS[Math.round(bearingDeg(from, to) / 45) % 8];
}

// ---------------------------------------------------------------------------
// Feedback tiers (CLAUDE.md §5)
// ---------------------------------------------------------------------------

// GREEN exact · CYAN shares a state (Naija) / a land border (Africa) ·
// YELLOW same geopolitical zone (Naija) / same AU region (Africa) · RED otherwise.
// A tribe's zones are exactly the zones of its states (data/tribes.js derives
// them, data/validate.js checks it), so "any guessed state in the same zone as
// any target state" is "the zone lists overlap".
export function tierOf(mode, guess, target) {
  if (guess.id === target.id) return 'green';
  if (mode === 'naija') {
    if (guess.states.some((s) => target.states.includes(s))) return 'cyan';
    if (guess.zones.some((z) => target.zones.includes(z))) return 'yellow';
    return 'red';
  }
  if (mode !== 'africa') throw new Error(`game: unknown mode "${mode}"`);
  if (target.neighbours.includes(guess.id)) return 'cyan';
  if (guess.region === target.region) return 'yellow';
  return 'red';
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export function dailySeed(mode, dateString) {
  return hashString(`roots3d:${mode}:${dateString}`);
}

// The Daily Origin: seed from the mode and UTC date, then that index (mod the
// dataset size) into the dataset sorted by id.
export function dailyTarget(mode, dateString) {
  if (!DATE_RE.test(String(dateString))) throw new Error(`game: Daily needs a YYYY-MM-DD date, got "${dateString}"`);
  const list = dataFor(mode).list;
  return list[dailySeed(mode, dateString) % list.length];
}

// A per-round Endless seed from a session key, e.g. endlessSeed('africa', key, 3).
export function endlessSeed(mode, sessionKey, round) {
  return hashString(`roots3d:endless:${mode}:${sessionKey}:${round}`);
}

function seedToInt(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  if (typeof seed === 'string' && seed) return hashString(seed);
  throw new Error('game: Endless needs a seed (number or string)');
}

// Endless: a PRNG seeded per run picks from the dataset, skipping `exclude`
// (e.g. already solved) unless that would leave nothing to pick.
function endlessTarget(mode, seed, exclude) {
  const list = dataFor(mode).list;
  const skip = new Set(exclude);
  const pool = list.filter((x) => !skip.has(x.id));
  const from = pool.length ? pool : list;
  const rng = mulberry32(seed);
  return from[Math.floor(rng() * from.length)];
}

// ---------------------------------------------------------------------------
// A run: one target, a battery, up to 8 clues and 3 guesses
// ---------------------------------------------------------------------------

// createRun({ mode, kind: 'daily' | 'endless', dateString, seed, exclude, streak })
//   daily:   dateString 'YYYY-MM-DD' (UTC) picks the target.
//   endless: seed (number or string) picks the target; exclude lists ids to skip.
//   streak:  the streak going into this run; +1 on a win, 0 on a loss.
//   targetId: forces the target (the ?capture showcase only; normal play never
//            passes it). Must be an id in this mode's dataset.
// Events (run.on(type, fn) returns an unsubscribe function):
//   clueUnlocked { index, category, text, cost, battery }
//   guessMade    { id, name, tier, distanceKm, bearing, battery, guessesLeft }
//   won          { battery, guesses, cluesUnlocked, streak, target }
//   lost         { battery, guesses, cluesUnlocked, streak, target }
export function createRun({ mode, kind = 'daily', dateString, seed, exclude = [], streak = 0, targetId = null } = {}) {
  const data = dataFor(mode);
  if (!RUN_KINDS.includes(kind)) throw new Error(`game: unknown run kind "${kind}"`);
  if (targetId !== null && !data.lookup[targetId]) throw new Error(`game: unknown target "${targetId}" for ${mode}`);
  const runSeed = kind === 'daily' ? dailySeed(mode, dateString) : seedToInt(seed);
  const picked = kind === 'daily' ? dailyTarget(mode, dateString) : endlessTarget(mode, runSeed, exclude);
  const target = targetId !== null ? data.lookup[targetId] : picked;

  const state = {
    battery: BATTERY_START,
    cluesUnlocked: 1, // clue 1 (terrain & climate) is free and open from the start
    guesses: [],
    status: 'playing', // 'playing' | 'won' | 'lost'
    streak: Math.max(0, Math.floor(Number(streak) || 0)),
  };

  const listeners = new Map();
  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type)?.delete(fn);
  }
  function emit(type, payload) {
    for (const fn of [...(listeners.get(type) ?? [])]) fn(payload);
  }

  function nextClueCost() {
    return state.cluesUnlocked < CLUE_COSTS.length ? CLUE_COSTS[state.cluesUnlocked] : null;
  }

  function clue(index) {
    return { index, category: CLUE_CATEGORIES[index], text: target.clues[index], cost: CLUE_COSTS[index] };
  }

  // Opens the next clue and drains its cost. Refused (no change) when the run
  // is over, every clue is open, or the battery can't cover the cost.
  function unlockClue() {
    if (state.status !== 'playing') return { ok: false, reason: 'over', battery: state.battery };
    const cost = nextClueCost();
    if (cost === null) return { ok: false, reason: 'all-unlocked', battery: state.battery };
    if (state.battery < cost) return { ok: false, reason: 'unaffordable', cost, battery: state.battery };
    state.battery -= cost;
    const event = { ...clue(state.cluesUnlocked), battery: state.battery };
    state.cluesUnlocked += 1;
    emit('clueUnlocked', event);
    return { ok: true, ...event };
  }

  function summary() {
    return {
      battery: state.battery,
      guesses: state.guesses.length,
      cluesUnlocked: state.cluesUnlocked,
      streak: state.streak,
      target,
    };
  }

  // Makes a guess by id. Unknown, repeated or late guesses are refused at no cost.
  function guess(id) {
    if (state.status !== 'playing') return { ok: false, reason: 'over', battery: state.battery };
    const g = data.lookup[id];
    if (!g) return { ok: false, reason: 'unknown', battery: state.battery };
    if (state.guesses.some((x) => x.id === id)) return { ok: false, reason: 'repeat', battery: state.battery };

    const tier = tierOf(mode, g, target);
    let distanceKm = 0;
    let bearing = null;
    if (tier !== 'green') {
      distanceKm = Math.round(haversineKm(g, target));
      bearing = bearing8(g, target);
      state.battery = Math.floor(state.battery * WRONG_GUESS_FACTOR);
    }
    state.guesses.push(Object.freeze({ id, tier, distanceKm, bearing, battery: state.battery }));
    const result = {
      ok: true,
      id,
      name: g.name,
      tier,
      distanceKm,
      bearing,
      battery: state.battery,
      guessesLeft: MAX_GUESSES - state.guesses.length,
    };
    emit('guessMade', result);

    if (tier === 'green') {
      state.status = 'won';
      state.streak += 1;
      emit('won', summary());
    } else if (state.guesses.length >= MAX_GUESSES) {
      state.status = 'lost';
      state.streak = 0;
      emit('lost', summary());
    }
    return { ...result, status: state.status };
  }

  return {
    mode,
    kind,
    dateString: kind === 'daily' ? dateString : null,
    seed: runSeed,
    target,
    on,
    unlockClue,
    guess,
    nextClueCost,
    get battery() {
      return state.battery;
    },
    get cluesUnlocked() {
      return state.cluesUnlocked;
    },
    get guesses() {
      return state.guesses.slice();
    },
    get status() {
      return state.status;
    },
    get streak() {
      return state.streak;
    },
    get guessesLeft() {
      return MAX_GUESSES - state.guesses.length;
    },
    // The clues opened so far, in order.
    get clues() {
      return Array.from({ length: state.cluesUnlocked }, (_, i) => clue(i));
    },
    // Battery left on a win, 0 otherwise.
    get score() {
      return state.status === 'won' ? state.battery : 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Self-tests (main.js runs these with ?debug)
// ---------------------------------------------------------------------------

// [mode, target, guess, expected tier]: hand-picked from the data.
const TIER_CASES = [
  ['naija', 'yoruba', 'yoruba', 'green'],
  ['naija', 'hausa', 'fulani', 'cyan'], // share Kano (and more)
  ['naija', 'yoruba', 'nupe', 'cyan'], // share Kwara and Kogi
  ['naija', 'igbo', 'ijaw', 'cyan'], // share Delta and Rivers
  ['naija', 'efik', 'ibibio', 'yellow'], // Cross River vs Akwa Ibom, both South South
  ['naija', 'idoma', 'igala', 'yellow'], // Benue vs Kogi, both North Central
  ['naija', 'kanuri', 'hausa', 'yellow'], // Bauchi is North East, no shared state
  ['naija', 'kanuri', 'ijaw', 'red'],
  ['naija', 'efik', 'kanuri', 'red'],
  ['africa', 'nga', 'nga', 'green'],
  ['africa', 'nga', 'cmr', 'cyan'],
  ['africa', 'egy', 'sdn', 'cyan'], // a border across two AU regions is still CYAN
  ['africa', 'lso', 'zaf', 'cyan'],
  ['africa', 'nga', 'gha', 'yellow'],
  ['africa', 'mdg', 'com', 'yellow'], // islands: same region, no land border
  ['africa', 'nga', 'ken', 'red'],
  ['africa', 'mdg', 'moz', 'red'],
];

// 2026-01-01 … 2026-03-01, written out without touching the clock.
const SIXTY_DAYS = [[1, 31], [2, 28], [3, 1]].flatMap(([month, days]) => Array.from({ length: days }, (_, i) => `2026-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`));

export function selfTest() {
  const results = [];
  const check = (title, ok, detail = '') => results.push({ title, ok: Boolean(ok), detail });

  // Distance and bearing.
  const lagos = { lat: 6.52, lon: 3.38 };
  const abuja = { lat: 9.06, lon: 7.49 };
  const km = haversineKm(lagos, abuja);
  check('Lagos → Abuja is 520–540 km', km >= 520 && km <= 540, `${km.toFixed(1)} km`);
  check('Lagos → Abuja bearing is NE', bearing8(lagos, abuja) === 'NE', `${bearingDeg(lagos, abuja).toFixed(1)}° → ${bearing8(lagos, abuja)}`);
  check('Abuja → Lagos bearing is SW', bearing8(abuja, lagos) === 'SW', bearing8(abuja, lagos));
  const o = { lat: 0, lon: 0 };
  const compass = [[{ lat: 1, lon: 0 }, 'N'], [{ lat: 0, lon: 1 }, 'E'], [{ lat: -1, lon: 0 }, 'S'], [{ lat: 0, lon: -1 }, 'W'], [{ lat: -1, lon: -1 }, 'SW']];
  check('Compass points from (0, 0)', compass.every(([p, want]) => bearing8(o, p) === want), compass.map(([p]) => bearing8(o, p)).join(' '));
  check('Distance to the same point is 0', haversineKm(lagos, lagos) === 0);

  // Tiers.
  for (const [mode, targetId, guessId, want] of TIER_CASES) {
    const { lookup } = dataFor(mode);
    const got = tierOf(mode, lookup[guessId], lookup[targetId]);
    check(`${mode}: guessing ${guessId} for ${targetId} is ${want.toUpperCase()}`, got === want, got === want ? '' : `got ${got}`);
  }

  // Determinism of the Daily and Endless targets.
  for (const mode of MODES) {
    const a = createRun({ mode, kind: 'daily', dateString: '2026-01-01' });
    const b = createRun({ mode, kind: 'daily', dateString: '2026-01-01' });
    check(`${mode}: same date + mode gives the same Daily target`, a.target.id === b.target.id && a.target.id === dailyTarget(mode, '2026-01-01').id, `2026-01-01 → ${a.target.id}`);
    const distinct = new Set(SIXTY_DAYS.map((day) => dailyTarget(mode, day).id)).size;
    check(`${mode}: Daily targets vary from day to day`, distinct >= 20, `${distinct} different targets over 60 days`);
    const e1 = createRun({ mode, kind: 'endless', seed: 'roots3d:test' });
    const e2 = createRun({ mode, kind: 'endless', seed: 'roots3d:test' });
    const e3 = createRun({ mode, kind: 'endless', seed: 'roots3d:test', exclude: [e1.target.id] });
    check(`${mode}: same Endless seed gives the same target, exclude is respected`, e1.target.id === e2.target.id && e3.target.id !== e1.target.id, `${e1.target.id} / excluded → ${e3.target.id}`);
  }

  // The §5 numbers, written out here so a changed constant can't pass by itself.
  check('Rules match CLAUDE.md §5 (10,000 battery, clue costs, 3 guesses, × 0.7)',
    BATTERY_START === 10000 && CLUE_COSTS.join() === '0,250,400,600,800,1100,1400,1750' && MAX_GUESSES === 3 && WRONG_GUESS_FACTOR === 0.7);

  {
    const forced = createRun({ mode: 'naija', kind: 'daily', dateString: '2026-01-01', targetId: 'tiv' });
    check('A forced target (capture showcase) replaces the Daily pick', forced.target.id === 'tiv' && forced.guess('nupe').tier === 'yellow', forced.target.id);
  }

  // Run mechanics.
  const wrongFor = (run, n) => answersFor(run.mode).filter((x) => x.id !== run.target.id).slice(0, n).map((x) => x.id);
  {
    const run = createRun({ mode: 'naija', kind: 'daily', dateString: '2026-01-01' });
    const events = { clueUnlocked: 0, guessMade: 0, won: 0, lost: 0 };
    for (const type of Object.keys(events)) run.on(type, () => { events[type] += 1; });
    check('A new run starts with 10,000 battery and clue 1 open', run.battery === BATTERY_START && run.cluesUnlocked === 1 && run.status === 'playing');
    let ok = true;
    for (let i = 1; i < CLUE_COSTS.length; i++) ok = ok && run.unlockClue().ok;
    const spent = CLUE_COSTS.reduce((sum, c) => sum + c, 0);
    check('Unlocking clues 2–8 drains exactly their costs', ok && spent === 6300 && run.battery === 3700, `battery ${run.battery}`);
    const extra = run.unlockClue();
    check('A ninth unlock is refused at no cost', !extra.ok && extra.reason === 'all-unlocked' && run.battery === 3700);
    const [w1] = wrongFor(run, 1);
    const before = run.battery;
    const g1 = run.guess(w1);
    check('A wrong guess drains to floor(battery × 0.7)', g1.ok && g1.battery === 2590 && g1.tier !== 'green', `${before} → ${g1.battery}`);
    const again = run.guess(w1);
    check('A repeated guess is refused at no cost', !again.ok && again.reason === 'repeat' && run.battery === g1.battery && run.guesses.length === 1);
    const unknown = run.guess('atlantis');
    check('An unknown id is refused at no cost', !unknown.ok && unknown.reason === 'unknown' && run.battery === g1.battery);
    const win = run.guess(run.target.id);
    check('The right guess wins with distance 0, keeps the battery and adds 1 to the streak', win.tier === 'green' && win.distanceKm === 0 && win.bearing === null && run.status === 'won' && run.score === g1.battery && run.streak === 1);
    check('No guesses after the run ends', run.guess(wrongFor(run, 2)[1]).reason === 'over');
    check('Events fire for clues, guesses and the win', events.clueUnlocked === 7 && events.guessMade === 2 && events.won === 1 && events.lost === 0, JSON.stringify(events));
  }
  {
    const run = createRun({ mode: 'africa', kind: 'endless', seed: 7, streak: 4 });
    let lost = null;
    run.on('lost', (e) => { lost = e; });
    const wrong = wrongFor(run, 3);
    run.guess(wrong[0]);
    run.guess(wrong[1]);
    let refused = null;
    while (!refused) {
      const r = run.unlockClue();
      if (!r.ok) refused = r;
    }
    check('A clue the battery can\'t cover is refused at no cost', refused.reason === 'unaffordable' && run.battery === refused.battery && run.battery < refused.cost, `${refused.cost} needed, ${run.battery} left`);
    const last = run.guess(wrong[2]);
    check('Three wrong guesses lose the run and reset the streak', last.status === 'lost' && run.status === 'lost' && run.streak === 0 && lost?.target.id === run.target.id && run.score === 0);
    check('Every wrong guess reports a distance and a compass bearing', run.guesses.every((g) => g.distanceKm > 0 && COMPASS.includes(g.bearing)));
  }

  // Data: answers sharing a point would get no bearing.
  for (const mode of MODES) {
    const pts = new Map();
    for (const x of answersFor(mode)) {
      const key = `${x.lat},${x.lon}`;
      pts.set(key, [...(pts.get(key) ?? []), x.id]);
    }
    const same = [...pts.values()].filter((ids) => ids.length > 1);
    check(`${mode}: no two answers share a lat/lon (every wrong guess gets a bearing)`, same.length === 0, same.map((ids) => ids.join('=')).join(', '));
  }

  const failed = results.filter((r) => !r.ok).length;
  return { ok: failed === 0, passed: results.length - failed, failed, results };
}

// Prints the self-test report (or to any object with log/error/group).
export function runSelfTests(out = console) {
  const report = selfTest();
  (out.group || out.log).call(out, `[roots3d] game self-tests: ${report.ok ? 'PASS' : 'FAIL'} (${report.passed}/${report.results.length})`);
  for (const r of report.results) {
    if (r.ok) out.log(`✔ ${r.title}${r.detail ? ` · ${r.detail}` : ''}`);
    else out.error(`✘ ${r.title}${r.detail ? ` · ${r.detail}` : ''}`);
  }
  out.groupEnd?.();
  return report;
}
