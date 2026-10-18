// Shared geometry and materials for the map boards (board.js). Built once and
// used by both boards; createBoardParts().dispose() frees them.
// Every mesh is low-poly with flat shading and vertex colours, so one material
// covers many kinds of object.

import * as THREE from 'three';
import { createRng, randRange, randInt, pick } from './rng.js';
import { place, paint, mergeGeometries, jitter, shared, clamp } from './geom.js';

const TILE_DEPTH = 0.6; // tiles extend this far below their top, hidden in the island
export const DECOR_KINDS = Object.freeze(['tree', 'acacia', 'palm', 'rock', 'hut']);
const GLOW_COLOR = '#fff1c9';

// Six warm, harmonious zone colours for Naija mode.
// Every colour is at least ΔE2000 18 from the island grass (#93b964), so the
// tiles never melt into the gaps between them, and at least 18 from each other.
export const ZONE_COLORS = Object.freeze({
  'north-west': '#ebc867', // millet gold
  'north-east': '#e3955a', // laterite orange
  'north-central': '#b98aa6', // dusk mauve
  'south-west': '#d0675a', // terracotta
  'south-east': '#4d8c5d', // deep palm green
  'south-south': '#4d9aa6', // mangrove teal
});

// One colour per AU region for Africa mode.
export const REGION_COLORS = Object.freeze({
  north: '#ebc874', // sand
  west: '#e08a4f', // laterite
  central: '#4d8c5d', // forest
  east: '#4d9aa6', // lakes teal
  southern: '#b9708e', // plum clay
});

export const GROUP_COLORS = { naija: ZONE_COLORS, africa: REGION_COLORS };

// Shorter label text where the full name would make a very long pill.
export const LABEL_NAMES = {
  africa: { caf: 'Central African Rep.', cog: 'Rep. of the Congo', stp: 'São Tomé & Príncipe' },
  naija: { fct: 'FCT Abuja' },
};

// Higher ground stands a little taller (world units added to the tile height).
export const HIGHLANDS = {
  naija: { plateau: 0.14, taraba: 0.1, adamawa: 0.06, ekiti: 0.06, kaduna: 0.04, bauchi: 0.04 },
  africa: { eth: 0.14, lso: 0.14, ken: 0.07, rwa: 0.07, bdi: 0.07, mar: 0.05, zaf: 0.05, swz: 0.05, zwe: 0.04 },
};

// Decorations per tile: how many, and which kinds by zone / region.
const DECOR = {
  naija: {
    perTile: [2, 4],
    kinds: {
      'north-west': ['acacia', 'hut', 'acacia', 'rock'],
      'north-east': ['acacia', 'rock', 'hut', 'acacia'],
      'north-central': ['tree', 'acacia', 'hut', 'rock'],
      'south-west': ['tree', 'palm', 'hut', 'tree'],
      'south-east': ['tree', 'palm', 'tree', 'hut'],
      'south-south': ['palm', 'tree', 'palm', 'hut'],
    },
  },
  africa: {
    perTile: [1, 2],
    kinds: {
      north: ['rock', 'palm', 'rock'],
      west: ['tree', 'palm', 'hut'],
      central: ['tree', 'tree', 'palm'],
      east: ['acacia', 'hut', 'rock'],
      southern: ['acacia', 'rock', 'hut'],
    },
    island: ['palm'],
  },
};

// Lathe profiles run bottom → top so the faces point outward. Six segments make
// a pointy-top hexagon (a corner at +z), matching board-layout.js.
function lathe(points, segments = 6) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// Darker towards the bottom: reads as soft contact shadow on the tile sides.
function shadeByHeight(geo, stops) {
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let v = stops[stops.length - 1][1];
    for (const [above, value] of stops) {
      if (y > above) {
        v = value;
        break;
      }
    }
    arr[i * 3] = v;
    arr[i * 3 + 1] = v;
    arr[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function tileGeometry() {
  const geo = lathe([[1, -TILE_DEPTH], [1, -0.3], [1, -0.05], [0.93, 0], [0, 0]]);
  return shadeByHeight(geo, [[-0.001, 1], [-0.051, 0.9], [-0.301, 0.8], [-Infinity, 0.62]]);
}

function raftGeometry() {
  return mergeGeometries([
    paint(lathe([[0, -0.11], [0.9, -0.11], [1, -0.065], [1, 0], [0.9, 0]]), '#a8764a'),
    paint(place(new THREE.CylinderGeometry(0.9, 0.9, 0.02, 6), { y: -0.006 }), '#82cfc9'),
  ]);
}

function treeGeometry() {
  return mergeGeometries([
    paint(place(new THREE.CylinderGeometry(0.028, 0.04, 0.2, 5), { y: 0.1 }), '#8a5a35'),
    paint(place(new THREE.ConeGeometry(0.15, 0.26, 6), { y: 0.3 }), '#6fa651'),
    paint(place(new THREE.ConeGeometry(0.11, 0.2, 6), { y: 0.43 }), '#86b85e'),
  ]);
}

function acaciaGeometry() {
  return mergeGeometries([
    paint(place(new THREE.CylinderGeometry(0.02, 0.032, 0.26, 5), { y: 0.13, rz: 0.08 }), '#7a5232'),
    paint(place(new THREE.IcosahedronGeometry(0.19, 0), { x: 0.01, y: 0.29, sx: 1, sy: 0.3, sz: 1 }), '#8f9c4c'),
    paint(place(new THREE.IcosahedronGeometry(0.12, 0), { x: -0.06, y: 0.33, z: 0.04, sx: 1, sy: 0.32, sz: 1 }), '#9fab58'),
  ]);
}

function palmGeometry() {
  const parts = [paint(place(new THREE.CylinderGeometry(0.018, 0.03, 0.4, 5), { y: 0.2, rz: -0.1 }), '#8f6a45')];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(paint(place(new THREE.BoxGeometry(0.2, 0.012, 0.05), {
      x: 0.02 + Math.cos(a) * 0.09, y: 0.39, z: Math.sin(a) * 0.09, ry: -a, rz: -0.35,
    }), i % 2 ? '#6aa552' : '#7ab45c'));
  }
  return mergeGeometries(parts);
}

function rockGeometry() {
  const geo = jitter(new THREE.DodecahedronGeometry(0.085, 0), createRng('roots3d:board:rock'), 0.018);
  place(geo, { y: 0.03, sy: 0.7 });
  return paint(geo, '#a08b70');
}

function hutGeometry() {
  return mergeGeometries([
    paint(place(new THREE.CylinderGeometry(0.1, 0.11, 0.12, 8), { y: 0.06 }), '#c98f5a'),
    paint(place(new THREE.ConeGeometry(0.155, 0.13, 8), { y: 0.185 }), '#d8b36a'),
    paint(place(new THREE.BoxGeometry(0.04, 0.07, 0.012), { y: 0.035, z: 0.104 }), '#5a3a22'),
  ]);
}

// A soft vertical fade for the rim glow curtain (white at the base → clear).
function glowFadeTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#000');
  g.addColorStop(1, '#fff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

export function createBoardParts() {
  const owned = [];
  const keep = (r) => {
    owned.push(r);
    return shared(r);
  };

  const geos = {
    tile: keep(tileGeometry()),
    raft: keep(raftGeometry()),
    tree: keep(treeGeometry()),
    acacia: keep(acaciaGeometry()),
    palm: keep(palmGeometry()),
    rock: keep(rockGeometry()),
    hut: keep(hutGeometry()),
  };
  const mats = {
    tile: keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true })),
    raft: keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true })),
    decor: keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true })),
  };

  // Rim glow for the hovered tile: a bright hexagon outline plus a short
  // curtain of light rising from the tile's edge. One of each, never repeated.
  const ringGeo = keep(new THREE.RingGeometry(1.0, 1.14, 6, 1, Math.PI / 6));
  ringGeo.rotateX(-Math.PI / 2);
  const curtainGeo = keep(new THREE.CylinderGeometry(1.02, 1.02, 0.3, 6, 1, true));
  curtainGeo.translate(0, 0.15, 0);
  const fade = keep(glowFadeTexture());
  const glowMat = (extra) => keep(new THREE.MeshBasicMaterial({
    color: GLOW_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
    ...extra,
  }));
  const ringMat = glowMat({});
  const curtainMat = glowMat({ alphaMap: fade, side: THREE.DoubleSide });
  const glow = new THREE.Group();
  glow.name = 'tileGlow';
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.004;
  const curtain = new THREE.Mesh(curtainGeo, curtainMat);
  ring.renderOrder = 5;
  curtain.renderOrder = 5;
  glow.add(ring, curtain);
  glow.visible = false;

  return {
    geos,
    mats,
    glow,
    glowMats: [ringMat, curtainMat],
    dispose() {
      for (const r of owned) r.dispose();
      glow.removeFromParent();
    },
  };
}

// Scatters decorations over each tile (seeded per tile id). rest: the board's
// tiles ({ index, id, group, island }); tileR: tile radius in world units.
// Returns { kind: [{ tile, local: Matrix4 }] }, positions relative to the tile top.
export function buildDecor(mode, rest, tileR) {
  const spec = DECOR[mode];
  const scale = clamp(tileR / 0.65, 0.5, 1);
  const byKind = Object.fromEntries(DECOR_KINDS.map((k) => [k, []]));
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (const c of rest) {
    const rng = createRng(`roots3d:board:${mode}:decor:${c.id}`);
    const kinds = (c.island && spec.island) || spec.kinds[c.group];
    const count = c.island ? 1 : randInt(rng, spec.perTile[0], spec.perTile[1]);
    const spots = [];
    // Keep the centre clear (labels, flags) and stay inside the hexagon.
    for (let tries = 0; spots.length < count && tries < 40; tries++) {
      const a = randRange(rng, 0, Math.PI * 2);
      const r = tileR * randRange(rng, 0.34, 0.62);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (spots.some((o) => Math.hypot(o.x - x, o.z - z) < tileR * 0.34)) continue;
      spots.push({ x, z });
    }
    for (const spot of spots) {
      const kind = pick(rng, kinds);
      const k = scale * randRange(rng, 0.8, 1.15);
      q.setFromAxisAngle(up, randRange(rng, 0, Math.PI * 2));
      const local = new THREE.Matrix4().compose(p.set(spot.x, 0, spot.z), q, s.set(k, k, k));
      byKind[kind].push({ tile: c.index, local });
    }
  }
  return byKind;
}

// On-screen size (CSS px) of instance i of a tile mesh: the narrow side of the
// box around its projected hexagonal prism, the same shape a tap raycast hits.
const _corner = new THREE.Vector3();
const _inst = new THREE.Matrix4();
export function tileScreenPx(tiles, i, camera, width, height) {
  tiles.getMatrixAt(i, _inst);
  _inst.premultiply(tiles.matrixWorld);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < 12; k++) {
    const a = ((k % 6) * Math.PI) / 3; // pointy-top: a corner at +z, like lathe()
    _corner.set(Math.sin(a), k < 6 ? 0 : -TILE_DEPTH, Math.cos(a)).applyMatrix4(_inst).project(camera);
    const x = ((_corner.x + 1) / 2) * width;
    const y = ((1 - _corner.y) / 2) * height;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return Math.min(x1 - x0, y1 - y0);
}
