// Player progress kept on this device (NOTES §7): best Daily points, the Daily
// streak (consecutive UTC days with a Daily solved), the solved total, the
// Endless streak per mode, and the action log of the current Daily / Endless
// runs. Runs are saved as the actions taken (clues opened, ids guessed) and
// rebuilt by replaying them through game.js, so a refresh restores the exact
// battery and can't replay a finished Daily. No clock is read here: dates come
// in as 'YYYY-MM-DD' strings.

import { readJSON, writeJSON } from './storage.js';

const STATS_KEY = 'stats:v1';
const MODES = ['naija', 'africa'];

// ---------------------------------------------------------------------------
// Calendar maths on 'YYYY-MM-DD' strings (UTC, no Date object needed)
// ---------------------------------------------------------------------------

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysIn(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

const pad = (n) => String(n).padStart(2, '0');

export function previousDay(dateString) {
  let [y, m, d] = String(dateString).split('-').map(Number);
  d -= 1;
  if (d < 1) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    d = daysIn(y, m);
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const wholeNumber = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const dateOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function normaliseStats(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const endless = {};
  for (const mode of MODES) {
    const e = r.endless?.[mode] ?? {};
    endless[mode] = { streak: wholeNumber(e.streak), best: wholeNumber(e.best), round: wholeNumber(e.round) };
  }
  return {
    bestPoints: wholeNumber(r.bestPoints),
    dailyStreak: wholeNumber(r.dailyStreak),
    lastDailyWin: dateOrNull(r.lastDailyWin),
    solved: wholeNumber(r.solved),
    endless,
  };
}

export function loadStats() {
  return normaliseStats(readJSON(STATS_KEY));
}

export function saveStats(stats) {
  return writeJSON(STATS_KEY, stats);
}

// The Daily streak as of `today`: it lapses once a whole UTC day passes
// without a Daily solved.
export function currentDailyStreak(stats, today) {
  return stats.lastDailyWin === today || stats.lastDailyWin === previousDay(today) ? stats.dailyStreak : 0;
}

// A Daily won on `today` with `battery` left. Solving the second mode's Daily
// on the same day doesn't count twice.
export function recordDailyWin(stats, today, battery) {
  if (stats.lastDailyWin !== today) {
    stats.dailyStreak = currentDailyStreak(stats, today) + 1;
    stats.lastDailyWin = today;
  }
  stats.bestPoints = Math.max(stats.bestPoints, wholeNumber(battery));
  stats.solved += 1;
}

// A lost Daily resets the streak (NOTES §7). A win later the same day starts again at 1.
export function recordDailyLoss(stats) {
  stats.dailyStreak = 0;
  stats.lastDailyWin = null;
}

export function recordEndless(stats, mode, won) {
  const e = stats.endless[mode];
  if (won) {
    e.streak += 1;
    e.best = Math.max(e.best, e.streak);
    stats.solved += 1;
  } else {
    e.streak = 0;
  }
}

// The three leaderboard stats to send (NOTES §7: always all three).
export function leaderboardStats(stats, today) {
  return { points: stats.bestPoints, streak: currentDailyStreak(stats, today), solved: stats.solved };
}

// ---------------------------------------------------------------------------
// Run logs
// ---------------------------------------------------------------------------

export function dailyKey(mode, date) {
  return `daily:v1:${mode}:${date}`;
}

export function endlessKey(mode) {
  return `endless:v1:${mode}`;
}

const strings = (v, max) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, max) : []);

// The action that opens the next clue (answer ids never start with '+').
export const CLUE_ACTION = '+clue';

// { actions: ['+clue' | answer id, ...] in the order played (battery depends on
//   the order: a clue cost before or after a × 0.7 guess differs),
//   tiles: [tile id flown to, per guess], round: Endless round,
//   exclude: [ids] the Endless pick skipped }
// exclude is saved because the plaza grows after a win: replaying with the new
// list could pick a different target.
export function loadRunLog(key) {
  const r = readJSON(key);
  if (!r || typeof r !== 'object') return null;
  return {
    actions: strings(r.actions, 10), // at most 7 clues + 3 guesses
    tiles: strings(r.tiles, 3),
    round: wholeNumber(r.round),
    exclude: strings(r.exclude, 200),
  };
}

export function saveRunLog(key, log) {
  return writeJSON(key, { actions: log.actions, tiles: log.tiles, round: log.round ?? 0, exclude: log.exclude ?? [] });
}
