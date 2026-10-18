// start.ng bridge for ROOTS 3D.
// Talks to the hidden https://start.ng/connect page with postMessage, exactly as
// documented in NOTES.md (sections 2–5). This file runs outside the simulation:
// its timers never touch sim time or game randomness.

const START_NG = 'https://start.ng';
const CONNECT_URL = `${START_NG}/connect`;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_STAT = 1000000000;

// ---------------------------------------------------------------------------
// Character style
// ---------------------------------------------------------------------------

// Every value start.ng documents today. Unknown future values fall back (NOTES §3).
export const STYLE_OPTIONS = Object.freeze({
  body: Object.freeze(['female', 'male']),
  hair: Object.freeze(['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald']),
  hat: Object.freeze(['none', 'cap', 'beanie', 'tophat', 'crown']),
  accessory: Object.freeze(['none', 'glasses', 'earrings', 'beard', 'scarf', 'backpack']),
});

// [ours] Extra looks avatar.js can draw beyond the documented values (requested
// in the ROOTS 3D brief). start.ng doesn't send these today; if it ever does,
// they render instead of falling back. Aliases map brief names onto docs values.
export const EXTRA_STYLE_OPTIONS = Object.freeze({
  hat: Object.freeze(['fila', 'headwrap']),
  accessory: Object.freeze(['shades', 'beads']),
});
const STYLE_ALIASES = Object.freeze({
  hair: Object.freeze({ locks: 'dreads' }),
  hat: Object.freeze({ hat: 'tophat' }),
});

// Neutral look used for any missing or unknown field (or a null style).
export const DEFAULT_STYLE = Object.freeze({
  body: 'male',
  primaryColor: '#c8643b',
  secondaryColor: '#3d4a5c',
  skinColor: '#8d5524',
  hairColor: '#1b1410',
  hair: 'short',
  hat: 'none',
  accessory: 'none',
});

// Complete look for the offline / capture-mode guest: a sun-ready explorer.
const OFFLINE_GUEST_STYLE = Object.freeze({
  body: 'male',
  primaryColor: '#e0913f',
  secondaryColor: '#3f5a4a',
  skinColor: '#8d5524',
  hairColor: '#1c1410',
  hair: 'short',
  hat: 'cap',
  accessory: 'backpack',
});

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

function normaliseColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (HEX6.test(v)) return v.toLowerCase();
  if (HEX3.test(v)) return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
  return fallback;
}

function normaliseOption(field, value, fallback) {
  if (typeof value !== 'string') return fallback;
  const v = STYLE_ALIASES[field]?.[value] ?? value;
  if (STYLE_OPTIONS[field].includes(v)) return v;
  if (EXTRA_STYLE_OPTIONS[field]?.includes(v)) return v;
  return fallback;
}

// Returns a complete, valid style block whatever start.ng sends (including null).
export function normaliseStyle(style) {
  const s = style && typeof style === 'object' ? style : {};
  return {
    body: normaliseOption('body', s.body, DEFAULT_STYLE.body),
    primaryColor: normaliseColor(s.primaryColor, DEFAULT_STYLE.primaryColor),
    secondaryColor: normaliseColor(s.secondaryColor, DEFAULT_STYLE.secondaryColor),
    skinColor: normaliseColor(s.skinColor, DEFAULT_STYLE.skinColor),
    hairColor: normaliseColor(s.hairColor, DEFAULT_STYLE.hairColor),
    hair: normaliseOption('hair', s.hair, DEFAULT_STYLE.hair),
    hat: normaliseOption('hat', s.hat, DEFAULT_STYLE.hat),
    accessory: normaliseOption('accessory', s.accessory, DEFAULT_STYLE.accessory),
  };
}

// ---------------------------------------------------------------------------
// Player objects
// ---------------------------------------------------------------------------

// source: 'user' (signed in), 'guest' (start.ng's guest), 'offline' (no bridge).
export function normalisePlayer(raw, source) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const isUser = source === 'user';
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Guest';
  const account = isUser && typeof r.account === 'string' && r.account.trim() ? r.account.trim() : null;
  const id = isUser && (typeof r.id === 'number' || typeof r.id === 'string') ? r.id : null;
  const face = typeof r.face === 'string' && r.face.startsWith('data:image/') ? r.face : null;
  return Object.freeze({
    id,
    name,
    account,
    style: Object.freeze(normaliseStyle(r.style)),
    face,
    isGuest: !isUser,
    source,
  });
}

// The clean offline guest: complete style, no face. Also the fixed capture-mode player.
export function createOfflineGuest() {
  return normalisePlayer({ name: 'Guest', style: OFFLINE_GUEST_STYLE, face: null }, 'offline');
}

// ---------------------------------------------------------------------------
// Where we are running
// ---------------------------------------------------------------------------

let networkDisabled = false;

// Capture mode calls this so nothing in the game can reach the network.
export function disableNetwork() {
  networkDisabled = true;
}

// The connect page only answers games served from *.start.ng (NOTES §2).
export function isStartNgHost(loc = window.location) {
  return loc.protocol === 'https:' && loc.hostname.endsWith('.start.ng');
}

export function bridgeAvailable() {
  return !networkDisabled && isStartNgHost();
}

// The player picked "play as a guest" on the start.ng homepage (NOTES §4).
export function isGuestLaunch(loc = window.location) {
  return new URLSearchParams(loc.search).has('guest');
}

// After sign-in start.ng appends #startng_session=...; with the connect bridge we
// don't need it, so we remove it from the address bar (NOTES §4).
export function consumeSessionHash() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (!hash.has('startng_session')) return;
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

export function signInUrl(loc = window.location) {
  return `${START_NG}/?return_to=${encodeURIComponent(loc.origin + loc.pathname)}`;
}

// Navigates to start.ng's sign-in. Returns false when the network is disabled.
export function goToSignIn() {
  if (networkDisabled) return false;
  window.location.href = signInUrl();
  return true;
}

// ---------------------------------------------------------------------------
// The connect bridge
// ---------------------------------------------------------------------------

let framePromise = null;
let requestCounter = 0;

function connectFrame() {
  framePromise ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = CONNECT_URL;
    el.hidden = true;
    el.title = 'start.ng connect';
    el.tabIndex = -1;
    el.setAttribute('aria-hidden', 'true');
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('start.ng connect page failed to load'));
    document.body.append(el);
  }).catch((err) => {
    framePromise = null; // allow a later retry
    throw err;
  });
  return framePromise;
}

// Sends a message and resolves to start.ng's reply, or null if it didn't answer in
// time. The timeout covers loading the frame too, so this never hangs.
export function askStartNg(message, replyType, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!bridgeAvailable()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = `roots3d-${++requestCounter}`;
    let frameEl = null;
    let settled = false;

    function done(reply) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    }

    function onMessage(e) {
      // Origin + source checks are what make the reply trustworthy (NOTES §2).
      if (!frameEl || e.origin !== START_NG || e.source !== frameEl.contentWindow) return;
      const data = e.data;
      if (data && typeof data === 'object' && data.type === replyType && data.requestId === requestId) {
        done(data);
      }
    }

    const timer = setTimeout(() => done(null), timeoutMs);
    addEventListener('message', onMessage);

    connectFrame().then(
      (el) => {
        if (settled) return;
        frameEl = el;
        el.contentWindow.postMessage({ ...message, requestId }, START_NG);
      },
      () => done(null),
    );
  });
}

// ---------------------------------------------------------------------------
// Who's playing — startng:whoami → startng:user (NOTES §3)
// ---------------------------------------------------------------------------

// Always resolves to a usable player: the signed-in user, start.ng's guest, or
// the offline guest when the bridge is unavailable or doesn't answer.
export async function whoami() {
  if (!bridgeAvailable()) return createOfflineGuest();
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  if (reply?.user) return normalisePlayer(reply.user, 'user');
  if (reply?.guest) return normalisePlayer(reply.guest, 'guest');
  return createOfflineGuest();
}

function playerKey(p) {
  return JSON.stringify([p.source, p.id, p.name, p.account, p.style, p.face]);
}

// Asks again whenever the player returns to the tab (visibilitychange / focus),
// because they may have signed in or out on start.ng. Calls onChange only when
// the player actually changed. A timed-out re-check is ignored, so a slow network
// never turns a signed-in player back into a guest. Returns a stop function.
export function watchPlayer(currentPlayer, onChange) {
  if (!bridgeAvailable()) return () => {};
  let lastKey = playerKey(currentPlayer);
  let inflight = false;

  async function recheck() {
    if (inflight || document.visibilityState === 'hidden') return;
    inflight = true;
    try {
      const player = await whoami();
      if (player.source === 'offline') return;
      const key = playerKey(player);
      if (key !== lastKey) {
        lastKey = key;
        onChange(player);
      }
    } finally {
      inflight = false;
    }
  }

  document.addEventListener('visibilitychange', recheck);
  window.addEventListener('focus', recheck);
  return () => {
    document.removeEventListener('visibilitychange', recheck);
    window.removeEventListener('focus', recheck);
  };
}

// ---------------------------------------------------------------------------
// Scores — startng:score → startng:scoreSaved (NOTES §5)
// ---------------------------------------------------------------------------

function isValidStat(v) {
  return Number.isInteger(v) && v >= 0 && v <= MAX_STAT;
}

// run is either { score: n } or { stats: { key: n, ... } } with exactly the keys
// declared in startng.json. Invalid numbers are rejected here, never "fixed".
// Resolves to { ok: true, result } or { ok: false, error, offline? }.
export async function submitScore(run) {
  let payload;
  if (run && run.stats && typeof run.stats === 'object') {
    const entries = Object.entries(run.stats);
    if (entries.length === 0 || entries.length > 5) return { ok: false, error: 'A run needs 1 to 5 stats' };
    const bad = entries.find(([, v]) => !isValidStat(v));
    if (bad) return { ok: false, error: `Stat "${bad[0]}" must be a whole number from 0 to ${MAX_STAT}` };
    payload = { stats: { ...run.stats } };
  } else if (run && isValidStat(run.score)) {
    payload = { score: run.score };
  } else {
    return { ok: false, error: `Score must be a whole number from 0 to ${MAX_STAT}` };
  }

  if (!bridgeAvailable()) return { ok: false, offline: true, error: 'Scores save once the game is live on start.ng' };
  const reply = await askStartNg({ type: 'startng:score', ...payload }, 'startng:scoreSaved');
  if (!reply) return { ok: false, error: 'start.ng did not answer. Try again in a moment' };
  if (reply.ok) return { ok: true, result: reply.result };
  return { ok: false, error: typeof reply.error === 'string' ? reply.error : 'Could not save the score' };
}

// ---------------------------------------------------------------------------
// Leaderboard — startng:leaderboard → startng:leaderboardData (NOTES §5)
// ---------------------------------------------------------------------------

function normaliseEntry(e) {
  return {
    rank: Number.isInteger(e?.rank) ? e.rank : 0,
    player_id: e?.player_id ?? null,
    name: typeof e?.name === 'string' && e.name ? e.name : 'Player',
    color: normaliseColor(e?.color, DEFAULT_STYLE.primaryColor),
    score: Number.isFinite(e?.score) ? e.score : 0,
    stats: e?.stats && typeof e.stats === 'object' ? { ...e.stats } : {},
  };
}

// Readable by everyone, guests included. limit is clamped to 1–50.
// Resolves to { ok: true, entries } or { ok: false, entries: [], error, offline? }.
export async function fetchLeaderboard(limit = 10) {
  const n = Math.min(Math.max(Math.trunc(Number(limit)) || 10, 1), 50);
  if (!bridgeAvailable()) return { ok: false, offline: true, entries: [], error: 'The leaderboard is available once the game is live on start.ng' };
  const reply = await askStartNg({ type: 'startng:leaderboard', limit: n }, 'startng:leaderboardData');
  if (!reply) return { ok: false, entries: [], error: 'start.ng did not answer. Try again in a moment' };
  if (!reply.ok || !Array.isArray(reply.entries)) {
    return { ok: false, entries: [], error: typeof reply.error === 'string' ? reply.error : 'Could not load the leaderboard' };
  }
  return { ok: true, entries: reply.entries.map(normaliseEntry) };
}

// True when a leaderboard entry belongs to this player (NOTES §5).
export function isOwnEntry(entry, player) {
  return !!player && player.source === 'user' && player.id !== null && entry.player_id === player.id;
}

// ---------------------------------------------------------------------------
// ROOTS 3D leaderboard policy (NOTES §5 + §7)
// ---------------------------------------------------------------------------

// The columns startng.json declares, in its order (the first one ranks). Keep
// these two in sync: start.ng refuses a run whose stats differ from the file.
export const LEADERBOARD_COLUMNS = Object.freeze([
  Object.freeze({ key: 'points', label: 'Best expedition' }),
  Object.freeze({ key: 'streak', label: 'Daily streak' }),
  Object.freeze({ key: 'solved', label: 'Origins found' }),
]);

// Why a run can't be sent right now, decided without waiting: capture mode
// (network disabled), off start.ng, or a guest (docs: signed-in players only).
// Returns the status submitRun would give, or null when it can be sent.
export function submitBlocked(player) {
  if (networkDisabled) return { state: 'disabled' };
  if (!bridgeAvailable()) return { state: 'offline', message: 'Scores save once the game is live on start.ng' };
  if (!player || player.source !== 'user') return { state: 'guest', message: 'Sign in to save your score' };
  return null;
}

// Sends one finished run. `stats` must carry exactly the declared keys, as
// whole numbers. Never sends in capture mode (network disabled), off start.ng,
// or for a guest (docs: signed-in players only); nothing is queued for later.
// Resolves to a status for the HUD:
//   { state: 'disabled' }                       capture mode: show nothing
//   { state: 'offline' | 'guest', message }     not sent
//   { state: 'submitted', improved, rank, best }
//   { state: 'error', message }
export async function submitRun(stats, player) {
  const keys = LEADERBOARD_COLUMNS.map((c) => c.key);
  const given = stats && typeof stats === 'object' ? Object.keys(stats) : [];
  if (given.length !== keys.length || !keys.every((k) => given.includes(k))) {
    return { state: 'error', message: `A run must send exactly: ${keys.join(', ')}` };
  }
  const blocked = submitBlocked(player);
  if (blocked) return blocked;
  const ordered = Object.fromEntries(keys.map((k) => [k, stats[k]]));
  const saved = await submitScore({ stats: ordered });
  if (!saved.ok) return { state: 'error', message: saved.error };
  const r = saved.result ?? {};
  return {
    state: 'submitted',
    improved: r.improved === true,
    rank: Number.isInteger(r.rank) ? r.rank : null,
    best: r.stats && typeof r.stats === 'object' ? { ...r.stats } : null,
  };
}
