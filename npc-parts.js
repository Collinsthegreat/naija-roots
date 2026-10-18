// Headgear and props for the Mystery Cultural Storyteller. Stylised and
// respectful (CLAUDE.md §7): simple shapes inspired by real attire and crafts,
// never caricature. Builders return [{ geo, mat }] where `mat` names a material
// slot that npc.js fills, so each group can reveal at its own stage.

import * as THREE from 'three';
import { place, paint, mergeGeometries, shared } from './geom.js';

export const HEADGEAR_TYPES = Object.freeze(['gele', 'fila', 'cap', 'turban', 'crown', 'beaded-crown', 'headwrap', 'none']);
export const PROP_TYPES = Object.freeze(['talking-drum', 'staff', 'fan', 'calabash', 'horn', 'walking-stick', 'woven-basket', 'beads']);

const cache = new Map();
function cached(key, build) {
  if (!cache.has(key)) cache.set(key, shared(build()));
  return cache.get(key);
}

// ---------------------------------------------------------------------------
// Headgear, in head space with head radius = 1 (npc.js scales it).
// Slots: main (colour 2), accent (colour 3), gold, painted (vertex colours).
// ---------------------------------------------------------------------------

const HEADGEAR = {
  none: () => [],

  // Gele: a sculpted, fan-pleated head tie.
  gele: () => [
    { mat: 'main', geo: cached('hg:gele:main', () => {
      const parts = [
        place(new THREE.SphereGeometry(1.07, 18, 10, 0, Math.PI * 2, 0, 1.3), { rx: -0.3 }),
        place(new THREE.TorusGeometry(1.0, 0.17, 8, 26), { y: 0.36, rx: Math.PI / 2 + 0.1 }),
      ];
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        parts.push(place(new THREE.SphereGeometry(0.62, 14, 8), {
          x: Math.sin(a) * 0.6, y: 1.05 + Math.cos(a) * 0.28, z: -0.22,
          rz: -a * 0.9, rx: -0.45, sx: 0.95, sy: 0.3, sz: 0.78,
        }));
      }
      return mergeGeometries(parts);
    }) },
    { mat: 'accent', geo: cached('hg:gele:knot', () =>
      place(new THREE.SphereGeometry(0.24, 10, 8), { x: 0.82, y: 0.62, z: 0.25, sx: 0.8, sy: 1.1, sz: 0.7 }),
    ) },
  ],

  // Fila: a soft cap folded over to one side.
  fila: () => [
    { mat: 'main', geo: cached('hg:fila:main', () => mergeGeometries([
      place(new THREE.CylinderGeometry(0.88, 0.95, 0.6, 22), { y: 0.78 }),
      place(new THREE.SphereGeometry(0.78, 16, 10), { x: 0.35, y: 1.12, rz: -0.38, sx: 1.12, sy: 0.45, sz: 0.92 }),
    ])) },
    { mat: 'accent', geo: cached('hg:fila:band', () => place(new THREE.CylinderGeometry(0.97, 0.98, 0.14, 22), { y: 0.5 })) },
  ],

  // Cap: a rounded brimless cap with an embroidered band.
  cap: () => [
    { mat: 'main', geo: cached('hg:cap:main', () => mergeGeometries([
      place(new THREE.CylinderGeometry(0.98, 1.0, 0.55, 22), { y: 0.66 }),
      place(new THREE.SphereGeometry(0.98, 22, 6, 0, Math.PI * 2, 0, 0.6), { y: 0.66, sy: 0.55 }),
    ])) },
    { mat: 'accent', geo: cached('hg:cap:band', () => place(new THREE.CylinderGeometry(1.02, 1.02, 0.14, 22), { y: 0.45 })) },
  ],

  // Turban: layered wraps with a small front jewel.
  turban: () => [
    { mat: 'main', geo: cached('hg:turban:main', () => mergeGeometries([
      place(new THREE.TorusGeometry(0.95, 0.24, 8, 26), { y: 0.38, rx: Math.PI / 2 + 0.08 }),
      place(new THREE.TorusGeometry(0.84, 0.23, 8, 26), { y: 0.66, rx: Math.PI / 2 - 0.1, rz: 0.08 }),
      place(new THREE.TorusGeometry(0.62, 0.21, 8, 22), { y: 0.9, rx: Math.PI / 2 + 0.05 }),
      place(new THREE.SphereGeometry(0.62, 16, 10), { y: 0.95, sy: 0.55 }),
    ])) },
    { mat: 'gold', geo: cached('hg:turban:jewel', () => place(new THREE.OctahedronGeometry(0.14, 0), { y: 0.6, z: 1.12 })) },
  ],

  // Crown: a gold circlet with points and inset stones.
  crown: () => [
    { mat: 'gold', geo: cached('hg:crown:gold', () => {
      const parts = [place(new THREE.CylinderGeometry(0.78, 0.74, 0.36, 20, 1, true), { y: 0.82 })];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        parts.push(place(new THREE.ConeGeometry(0.12, 0.34, 6), { x: Math.sin(a) * 0.76, y: 1.16, z: Math.cos(a) * 0.76 }));
      }
      return mergeGeometries(parts);
    }) },
    { mat: 'accent', geo: cached('hg:crown:stones', () => {
      const parts = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        parts.push(place(new THREE.SphereGeometry(0.075, 8, 6), { x: Math.sin(a) * 0.79, y: 0.82, z: Math.cos(a) * 0.79 }));
      }
      return mergeGeometries(parts);
    }) },
  ],

  // Beaded crown: a tall conical crown wrapped in bead bands, with a short fringe.
  'beaded-crown': () => [
    { mat: 'main', geo: cached('hg:bcrown:cone', () => mergeGeometries([
      place(new THREE.CylinderGeometry(0.36, 0.95, 1.5, 18), { y: 1.18 }),
      place(new THREE.SphereGeometry(0.36, 12, 8), { y: 1.93, sy: 0.6 }),
    ])) },
    { mat: 'painted', geo: cached('hg:bcrown:beads', () => {
      const parts = [];
      const bands = [[0.55, 0.92], [0.95, 0.8], [1.35, 0.66], [1.72, 0.52]];
      bands.forEach(([y, r], b) => {
        const n = Math.round(r * 26);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          parts.push(paint(place(new THREE.IcosahedronGeometry(0.075, 0), { x: Math.sin(a) * (r + 0.04), y, z: Math.cos(a) * (r + 0.04) }),
            (i + b) % 2 ? '#e3b23c' : '#f4efe6'));
        }
      });
      for (let s = -2; s <= 2; s++) {
        for (let k = 0; k < 3; k++) {
          parts.push(paint(place(new THREE.IcosahedronGeometry(0.055, 0), { x: s * 0.2, y: 0.46 - k * 0.12, z: 1.0 - k * 0.01 }), k === 2 ? '#e3b23c' : '#f4efe6'));
        }
      }
      parts.push(paint(place(new THREE.ConeGeometry(0.1, 0.3, 6), { y: 2.2 }), '#e3b23c'));
      return mergeGeometries(parts);
    }) },
  ],

  // Headwrap: a wrapped dome with a soft front knot.
  headwrap: () => [
    { mat: 'main', geo: cached('hg:wrap:dome', () => place(new THREE.SphereGeometry(1.12, 20, 10, 0, Math.PI * 2, 0, 1.38), { rx: -0.28 })) },
    { mat: 'accent', geo: cached('hg:wrap:folds', () => mergeGeometries([
      place(new THREE.TorusGeometry(1.0, 0.13, 6, 26), { y: 0.36, rx: Math.PI / 2 + 0.15 }),
      place(new THREE.TorusGeometry(0.92, 0.11, 6, 26), { y: 0.66, rx: Math.PI / 2 - 0.12 }),
      place(new THREE.SphereGeometry(0.22, 10, 8), { x: -0.14, y: 0.88, z: 0.72 }),
      place(new THREE.SphereGeometry(0.22, 10, 8), { x: 0.14, y: 0.88, z: 0.72 }),
    ])) },
  ],
};

export function headgearParts(type) {
  return (HEADGEAR[type] || HEADGEAR.none)();
}

// ---------------------------------------------------------------------------
// Props, in holder space at the hand. upright props keep the body's axes (npc.js
// counter-rotates the holder against the arm). `other` is an optional second
// piece for the other hand. Slots: wood, leather, cream, gourd, gold, main,
// accent, pattern, painted.
// ---------------------------------------------------------------------------

function bezierSegments(points, radii, segments) {
  const curve = new THREE.QuadraticBezierCurve3(...points.map((p) => new THREE.Vector3(...p)));
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  for (let i = 0; i < segments; i++) {
    const a = curve.getPoint(i / segments);
    const b = curve.getPoint((i + 1) / segments);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const r0 = radii[0] + (radii[1] - radii[0]) * (i / segments);
    const r1 = radii[0] + (radii[1] - radii[0]) * ((i + 1) / segments);
    const g = new THREE.CylinderGeometry(r1, r0, len * 1.04, 10, 1);
    q.setFromUnitVectors(up, dir.normalize());
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g);
  }
  return { parts, curve };
}

const PROPS = {
  'talking-drum': () => ({
    hand: 'left', upright: true, pose: 'drumming', offset: [0.1, 0.1, 0.08],
    parts: [
      { mat: 'wood', geo: cached('prop:drum:body', () => place(new THREE.LatheGeometry(
        [[0.09, -0.17], [0.07, -0.1], [0.05, 0], [0.07, 0.1], [0.09, 0.17]].map(([r, y]) => new THREE.Vector2(r, y)), 16,
      ), { rz: Math.PI / 2 })) },
      { mat: 'cream', geo: cached('prop:drum:heads', () => mergeGeometries([
        place(new THREE.CylinderGeometry(0.093, 0.093, 0.012, 16), { x: 0.172, rz: Math.PI / 2 }),
        place(new THREE.CylinderGeometry(0.093, 0.093, 0.012, 16), { x: -0.172, rz: Math.PI / 2 }),
      ])) },
      { mat: 'leather', geo: cached('prop:drum:cords', () => {
        const parts = [];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          parts.push(place(new THREE.CylinderGeometry(0.004, 0.004, 0.34, 4), { y: Math.cos(a) * 0.088, z: Math.sin(a) * 0.088, rz: Math.PI / 2 }));
        }
        return mergeGeometries(parts);
      }) },
    ],
    other: {
      upright: true, offset: [-0.05, -0.04, 0.02],
      parts: [{ mat: 'wood', geo: cached('prop:drum:beater', () => mergeGeometries([
        place(new THREE.CylinderGeometry(0.01, 0.013, 0.22, 6), { y: -0.08, rz: 1.1 }),
        place(new THREE.TorusGeometry(0.03, 0.01, 4, 8, Math.PI), { x: -0.11, y: -0.14, rz: 1.1 }),
      ])) }],
    },
  }),

  staff: () => ({
    hand: 'right', upright: true, pose: 'standing', offset: [0, 0, 0],
    parts: [
      { mat: 'wood', geo: cached('prop:staff:shaft', () => place(new THREE.CylinderGeometry(0.022, 0.028, 1.58, 8), { y: 0.11 })) },
      { mat: 'gold', geo: cached('prop:staff:top', () => mergeGeometries([
        place(new THREE.SphereGeometry(0.06, 12, 8), { y: 0.94 }),
        place(new THREE.TorusGeometry(0.035, 0.012, 6, 14), { y: 0.86, rx: Math.PI / 2 }),
        place(new THREE.ConeGeometry(0.03, 0.12, 8), { y: 1.05 }),
      ])) },
    ],
  }),

  fan: () => ({
    hand: 'right', upright: true, pose: 'gesturing', offset: [0, 0.02, 0.03],
    parts: [
      { mat: 'wood', geo: cached('prop:fan:handle', () => place(new THREE.CylinderGeometry(0.014, 0.016, 0.18, 6), { y: 0.08 })) },
      { mat: 'leather', geo: cached('prop:fan:disc', () => place(new THREE.CylinderGeometry(0.17, 0.17, 0.016, 22), { y: 0.33, rx: Math.PI / 2 })) },
      { mat: 'accent', geo: cached('prop:fan:rim', () => place(new THREE.TorusGeometry(0.17, 0.016, 6, 26), { y: 0.33 })) },
    ],
  }),

  calabash: () => ({
    hand: 'right', upright: true, pose: 'presenting', offset: [-0.17, 0.06, 0.04],
    parts: [
      { mat: 'gourd', geo: cached('prop:calabash:bowl', () =>
        new THREE.SphereGeometry(0.16, 18, 10, 0, Math.PI * 2, Math.PI / 2 - 0.25, Math.PI / 2 + 0.25),
      ) },
      { mat: 'accent', geo: cached('prop:calabash:band', () => mergeGeometries([
        place(new THREE.TorusGeometry(0.155, 0.012, 6, 24), { y: 0.035, rx: Math.PI / 2 }),
        place(new THREE.TorusGeometry(0.148, 0.01, 6, 24), { y: -0.04, rx: Math.PI / 2 }),
      ])) },
    ],
  }),

  horn: () => ({
    hand: 'right', upright: true, pose: 'gesturing', offset: [0, 0, 0],
    parts: [
      { mat: 'cream', geo: cached('prop:horn:body', () =>
        mergeGeometries(bezierSegments([[0, -0.04, 0], [0.04, 0.24, 0.06], [0.14, 0.42, -0.04]], [0.014, 0.055], 7).parts),
      ) },
      { mat: 'gold', geo: cached('prop:horn:bands', () => {
        const { curve } = bezierSegments([[0, -0.04, 0], [0.04, 0.24, 0.06], [0.14, 0.42, -0.04]], [0.014, 0.055], 1);
        return mergeGeometries([0.3, 0.7].map((u) => {
          const p = curve.getPoint(u);
          return place(new THREE.TorusGeometry(0.014 + 0.041 * u + 0.006, 0.008, 6, 16), { x: p.x, y: p.y, z: p.z, rx: Math.PI / 2 });
        }));
      }) },
    ],
  }),

  'walking-stick': () => ({
    hand: 'right', upright: true, pose: 'standing', offset: [0, 0, 0.02],
    parts: [{ mat: 'wood', geo: cached('prop:stick', () => mergeGeometries([
      place(new THREE.CylinderGeometry(0.018, 0.022, 0.72, 8), { y: -0.3 }),
      place(new THREE.TorusGeometry(0.06, 0.018, 6, 12, Math.PI), { y: 0.06, z: 0.06, ry: Math.PI / 2 }),
    ])) }],
  }),

  'woven-basket': () => ({
    hand: 'left', upright: true, pose: 'presenting', offset: [0.17, 0.0, 0.05],
    parts: [
      { mat: 'pattern', geo: cached('prop:basket:body', () => new THREE.CylinderGeometry(0.17, 0.13, 0.18, 18, 1, true)) },
      { mat: 'leather', geo: cached('prop:basket:base', () => mergeGeometries([
        place(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 18), { y: -0.09 }),
        place(new THREE.TorusGeometry(0.17, 0.014, 6, 24), { y: 0.09, rx: Math.PI / 2 }),
        place(new THREE.TorusGeometry(0.15, 0.012, 6, 16, Math.PI), { y: 0.09 }),
      ])) },
    ],
  }),

  beads: () => ({
    hand: 'right', upright: true, pose: 'presenting', offset: [0, -0.02, 0.03],
    parts: [{ mat: 'painted', geo: cached('prop:beads', () => {
      const parts = [];
      const n = 22;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        parts.push(paint(place(new THREE.IcosahedronGeometry(0.024, 1), {
          x: -0.36 * u, y: -Math.sin(u * Math.PI) * 0.2, z: Math.sin(u * Math.PI) * 0.03,
        }), i % 4 === 0 ? '#e3b23c' : i % 2 ? '#d2462f' : '#f4efe6'));
      }
      return mergeGeometries(parts);
    }) }],
  }),
};

export function propParts(type) {
  return (PROPS[type] || PROPS.staff)();
}
