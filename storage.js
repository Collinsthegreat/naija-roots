// Safe, versioned local storage for ROOTS 3D. Every access is wrapped in
// try/catch: when localStorage is missing, blocked or full (private windows,
// strict settings) the game keeps working from an in-memory copy for this page.
// Capture mode calls useMemoryStorage() so a capture never depends on what an
// earlier session saved on this machine.
//
// Keys are namespaced 'roots3d:' + key, and every key carries its own version
// ('plaza:v1', 'stats:v1', ...) so a later format can move to v2 cleanly.

const PREFIX = 'roots3d:';
const memory = new Map();
let forceMemory = false;
let probed = null; // null = not checked yet, then true / false

function local() {
  if (forceMemory) return null;
  if (probed === null) {
    try {
      const k = `${PREFIX}probe`;
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      probed = true;
    } catch {
      probed = false;
    }
  }
  return probed ? window.localStorage : null;
}

// Keep everything in memory for this page (capture mode, tests).
export function useMemoryStorage() {
  forceMemory = true;
}

// In memory-only mode, forget everything (a capture replay starts from 0).
export function resetMemoryStorage() {
  if (forceMemory) memory.clear();
}

// 'local' when values survive a reload, 'memory' otherwise.
export function storageKind() {
  return local() ? 'local' : 'memory';
}

// The stored value for key, or `fallback` when missing or unreadable.
export function readJSON(key, fallback = null) {
  const full = PREFIX + key;
  let text = null;
  const ls = local();
  if (ls) {
    try {
      text = ls.getItem(full);
    } catch {
      text = null;
    }
  } else if (memory.has(full)) {
    text = memory.get(full);
  }
  if (text === null || text === undefined) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// Saves value as JSON. Returns true if it reached localStorage (false when it
// only lives in memory for this page).
export function writeJSON(key, value) {
  const full = PREFIX + key;
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    return false;
  }
  memory.set(full, text);
  const ls = local();
  if (!ls) return false;
  try {
    ls.setItem(full, text);
    return true;
  } catch {
    return false;
  }
}
