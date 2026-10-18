// Deterministic randomness for ROOTS 3D.
// Every random decision in the game comes from a mulberry32 stream created here,
// seeded from hashString(...). Math.random() is never used.

// Deterministic 32-bit string hash: FNV-1a over UTF-16 code units, followed by
// the murmur3 finaliser so short or similar keys still spread across all 32 bits.
export function hashString(str) {
  const s = String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// mulberry32: tiny, fast, good-quality 32-bit PRNG. Returns floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convenience: a PRNG seeded from a string key, e.g. createRng('roots3d:clouds').
export function createRng(key) {
  return mulberry32(hashString(key));
}

// Float in [min, max).
export function randRange(rng, min, max) {
  return min + (max - min) * rng();
}

// Integer in [min, max] (inclusive).
export function randInt(rng, min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// One element of a non-empty array.
export function pick(rng, arr) {
  if (!arr || arr.length === 0) throw new Error('pick: empty array');
  return arr[Math.floor(rng() * arr.length)];
}

// A shuffled copy (Fisher–Yates). The input array is left untouched.
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
