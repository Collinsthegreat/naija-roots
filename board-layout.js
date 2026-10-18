// Hex-tile cartogram layout for both boards. Pure maths, no three.js, so it can
// be checked in Node. Real borders are never drawn: each region becomes one hex.
//
// 1. Project each region's lat/lon (equirectangular around the board's centre).
// 2. Scale to grid units and snap to an axial hex grid (pointy-top).
// 3. Resolve collisions in a fixed order (closest to the centre first, then id):
//    search outward ring by ring (a deterministic spiral) for the free cell
//    nearest the region's projected point.
// 4. Island nations go last, onto offshore cells with no occupied neighbour, so
//    each sits apart on its own raft.
// 5. Centre the result and scale it to fit the island top.
// Layouts are cached: each board is computed once per page.
//
// The Naija board skips steps 2–4 and uses a designed arrangement (NAIJA_GRID)
// instead: equal hexes can't follow Nigeria's small, packed southern states,
// and the snapping cascaded: Ondo was pushed three cells out, and Ekiti landed
// beside Niger, FCT and Oyo without touching Ondo. Now Ekiti touches all four
// of its neighbours (Kwara, Kogi, Ondo, Osun); an inland hex has six sides, so
// two more are unavoidable (Edo, close, and FCT, as near as any other).

import { STATES } from './data/nigeria.js';
import { COUNTRIES } from './data/africa.js';

const SQRT3 = Math.sqrt(3);
const FIT_RADIUS = 4.95; // world units; the island's flat grass top ends at 5.25
const MAX_CELL = 0.8; // never let a tile grow bigger than this (world circumradius)
const RAFT_SCALE = 1.3; // raft circumradius in cells (see board.js)
const MAX_RINGS = 30;
const KM_PER_DEGREE = 111.195; // one degree of latitude

// The Naija hexes, north up, one line per row; odd rows sit half a hex to the
// right (pointy-top). Designed so each state's tile touches as many of its real
// neighbours as possible: 72 of the 86 state borders are neighbouring tiles
// (snapping managed 64) and 10 tile pairs touch without a border (snapping: 23).
const NAIJA_GRID = `
.   .   SOK KAT JIG YOB BOR
  .   KEB ZAM KAN BAU GOM
.   .   NIG KAD PLA TAR ADA
  .   KWA FCT NAS BEN
OYO OSU EKI KOG ENU EBO
  OGU OND EDO ANA ABI CRV
LAG .   .   DEL IMO AKW
  .   .   BAY RIV`;
const NAIJA_CODES = {
  SOK: 'sokoto', KAT: 'katsina', KAN: 'kano', JIG: 'jigawa', YOB: 'yobe', BOR: 'borno',
  KEB: 'kebbi', ZAM: 'zamfara', KAD: 'kaduna', BAU: 'bauchi', GOM: 'gombe', ADA: 'adamawa',
  NIG: 'niger', FCT: 'fct', PLA: 'plateau', TAR: 'taraba', KWA: 'kwara', KOG: 'kogi', NAS: 'nasarawa', BEN: 'benue',
  OYO: 'oyo', OSU: 'osun', EKI: 'ekiti', ANA: 'anambra', ENU: 'enugu', EBO: 'ebonyi',
  OGU: 'ogun', OND: 'ondo', EDO: 'edo', IMO: 'imo', ABI: 'abia', CRV: 'cross-river',
  LAG: 'lagos', DEL: 'delta', RIV: 'rivers', AKW: 'akwa-ibom', BAY: 'bayelsa',
};

// cellsPerDegree: grid resolution. Tuned so tiles keep their neighbours while
// collisions only move small regions a cell or two. For Naija it only sets the
// km scale (the tiles come from `grid`).
const BOARDS = {
  naija: {
    cellsPerDegree: 0.5,
    grid: () => parseGrid(NAIJA_GRID, NAIJA_CODES),
    regions: () => STATES.map((s) => ({ id: s.id, name: s.name, group: s.zone, lat: s.lat, lon: s.lon, island: false })),
  },
  africa: {
    cellsPerDegree: 0.115,
    regions: () => COUNTRIES.map((c) => ({ id: c.id, name: c.name, group: c.region, lat: c.lat, lon: c.lon, island: c.island })),
  },
};

export const BOARD_MODES = Object.freeze(Object.keys(BOARDS));

// Axial neighbour directions, in the fixed order every spiral walks.
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// Pointy-top axial (q, r) → grid x/z for a cell circumradius of 1.
function axialToGrid(q, r) {
  return [SQRT3 * (q + r / 2), 1.5 * r];
}

function gridToAxial(x, z) {
  const fr = z / 1.5;
  const fq = x / SQRT3 - fr / 2;
  // Cube rounding.
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q + 0, r + 0]; // + 0 folds -0 into 0 for the cell keys
}

// A drawn grid (see NAIJA_GRID) → Map id → { q, r }. Line n is row r = n
// (even rows flush, odd rows half a hex right); "." is an empty cell.
function parseGrid(text, codes) {
  const cells = new Map();
  text.split('\n').filter((line) => line.trim()).forEach((line, r) => {
    line.trim().split(/\s+/).forEach((token, col) => {
      if (token === '.') return;
      const id = codes[token];
      if (!id || cells.has(id)) throw new Error(`board-layout: bad grid cell "${token}"`);
      cells.set(id, { q: col - (r - (r & 1)) / 2, r });
    });
  });
  return cells;
}

// The k-th ring around (q, r), always walked in the same order.
function ring(q, r, k) {
  if (k === 0) return [[q, r]];
  const out = [];
  let cq = q + DIRS[4][0] * k;
  let cr = r + DIRS[4][1] * k;
  for (let side = 0; side < 6; side++) {
    for (let j = 0; j < k; j++) {
      out.push([cq, cr]);
      cq += DIRS[side][0];
      cr += DIRS[side][1];
    }
  }
  return out;
}

const key = (q, r) => `${q},${r}`;

function neighboursOf(q, r) {
  return DIRS.map(([dq, dr]) => [q + dq, r + dr]);
}

// Nearest allowed cell to grid point (px, pz). Rings k and k + 1 are compared
// together, because a hex ring isn't a perfect circle.
function nearestCell(px, pz, allowed) {
  const [q0, r0] = gridToAxial(px, pz);
  for (let k = 0; k <= MAX_RINGS; k++) {
    let best = null;
    for (const kk of [k, k + 1]) {
      for (const [q, r] of ring(q0, r0, kk)) {
        if (!allowed(q, r)) continue;
        const [x, z] = axialToGrid(q, r);
        const d = Math.hypot(x - px, z - pz);
        if (!best || d < best.d - 1e-9) best = { q, r, d };
      }
    }
    if (best) return best;
  }
  throw new Error('board-layout: no free cell found');
}

// Neighbouring tiles trade cells when that brings the pair closer to their
// projected points (sum of squared distances). This undoes the small inversions
// that first-come placement leaves behind. The set of occupied cells never
// changes, the sweep order is fixed and the passes are bounded: deterministic.
function refineBySwaps(tiles, maxPasses = 24) {
  const at = new Map(tiles.map((t) => [key(t.q, t.r), t]));
  const cost = (t, q, r) => {
    const [x, z] = axialToGrid(q, r);
    return (x - t.px) ** 2 + (z - t.pz) ** 2;
  };
  for (let pass = 0; pass < maxPasses; pass++) {
    let swapped = false;
    for (const a of tiles) {
      for (const [nq, nr] of neighboursOf(a.q, a.r)) {
        const b = at.get(key(nq, nr));
        if (!b) continue;
        const before = cost(a, a.q, a.r) + cost(b, b.q, b.r);
        const after = cost(a, b.q, b.r) + cost(b, a.q, a.r);
        if (after >= before - 1e-9) continue;
        const [aq, ar] = [a.q, a.r];
        a.q = b.q;
        a.r = b.r;
        b.q = aq;
        b.r = ar;
        at.set(key(a.q, a.r), a);
        at.set(key(b.q, b.r), b);
        swapped = true;
      }
    }
    if (!swapped) break;
  }
}

function computeLayout(mode) {
  const board = BOARDS[mode];
  if (!board) throw new Error(`board-layout: unknown mode "${mode}"`);
  const regions = board.regions();

  // Equirectangular projection around the bounding-box centre.
  const lats = regions.map((g) => g.lat);
  const lons = regions.map((g) => g.lon);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
  const kx = Math.cos((lat0 * Math.PI) / 180) * board.cellsPerDegree * SQRT3;
  const kz = board.cellsPerDegree * SQRT3;
  const points = regions.map((g) => ({
    ...g,
    px: (g.lon - lon0) * kx, // east → +x
    pz: -(g.lat - lat0) * kz, // north → −z (away from the camera)
  }));

  // Fixed order: mainland first, closest to the centre first, then by id.
  const byOrder = (a, b) => Math.hypot(a.px, a.pz) - Math.hypot(b.px, b.pz) || (a.id < b.id ? -1 : 1);
  const mainland = points.filter((g) => !g.island).sort(byOrder);
  const islands = points.filter((g) => g.island).sort(byOrder);

  const used = new Map();
  const free = (q, r) => !used.has(key(q, r));
  const offshore = (q, r) => free(q, r) && neighboursOf(q, r).every(([nq, nr]) => free(nq, nr));

  function place(g, cell) {
    used.set(key(cell.q, cell.r), g.id);
    return { ...g, q: cell.q, r: cell.r };
  }
  const grid = board.grid?.();
  let land;
  let sea;
  // A designed grid sits in its own frame: `moved` is measured after lining
  // its centre up with the projected points' centre.
  let shiftX = 0;
  let shiftZ = 0;
  if (grid) {
    land = points.map((g) => {
      const cell = grid.get(g.id);
      if (!cell) throw new Error(`board-layout: "${g.id}" is missing from the ${mode} grid`);
      return place(g, cell);
    });
    sea = [];
    for (const t of land) {
      const [gx, gz] = axialToGrid(t.q, t.r);
      shiftX += (t.px - gx) / land.length;
      shiftZ += (t.pz - gz) / land.length;
    }
  } else {
    land = mainland.map((g) => place(g, nearestCell(g.px, g.pz, free)));
    refineBySwaps(land);
    sea = islands.map((g) => place(g, nearestCell(g.px, g.pz, offshore)));
  }

  const placed = [...land, ...sea].map((t) => {
    const [gx, gz] = axialToGrid(t.q, t.r);
    return { id: t.id, name: t.name, group: t.group, island: t.island, q: t.q, r: t.r, gx, gz, moved: Math.hypot(gx + shiftX - t.px, gz + shiftZ - t.pz) };
  });

  // Centre on the bounding box of the cells, then scale to fit the island top.
  const xs = placed.map((c) => c.gx);
  const zs = placed.map((c) => c.gz);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  let reach = 0;
  for (const c of placed) reach = Math.max(reach, Math.hypot(c.gx - cx, c.gz - cz) + (c.island ? RAFT_SCALE : 1));
  const cellSize = Math.min(MAX_CELL, FIT_RADIUS / reach);

  // Output in the original data order, so instance i is always the same region.
  const byId = new Map(placed.map((c) => [c.id, c]));
  const cells = regions.map((g, index) => {
    const c = byId.get(g.id);
    return Object.freeze({
      index,
      id: c.id,
      name: c.name,
      group: c.group,
      island: c.island,
      q: c.q,
      r: c.r,
      x: (c.gx - cx) * cellSize,
      z: (c.gz - cz) * cellSize,
      moved: c.moved, // grid cells between projected point and final cell
    });
  });

  return Object.freeze({
    mode,
    cellSize, // world circumradius of one hex cell
    kmScale: (kz * cellSize) / KM_PER_DEGREE, // world units per km on this board (for FX arcs)
    cells: Object.freeze(cells),
    index: Object.freeze(Object.fromEntries(cells.map((c) => [c.id, c.index]))),
  });
}

const cache = new Map();

// The cached layout for 'naija' or 'africa'.
export function getBoardLayout(mode) {
  if (!cache.has(mode)) cache.set(mode, computeLayout(mode));
  return cache.get(mode);
}
