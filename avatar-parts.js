// Procedural hair, hats and accessories for the start.ng explorer.
// Geometry depends only on the option (never on colour), so it is built once,
// cached and marked shared. Colours come from the per-avatar materials.

import * as THREE from 'three';
import { createRng } from './rng.js';
import { place, paint, mergeGeometries, jitter, shared } from './geom.js';

export const HEAD_RADIUS = 0.27;
const R = HEAD_RADIUS;

const cache = new Map();
function cached(key, build) {
  if (!cache.has(key)) cache.set(key, shared(build()));
  return cache.get(key);
}

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// Shared fixed-colour materials (never disposed).
export const FIXED = {
  gold: shared(new THREE.MeshStandardMaterial({ color: '#e3b23c', roughness: 0.35, metalness: 0.6 })),
  dark: shared(new THREE.MeshStandardMaterial({ color: '#2b2118', roughness: 0.6 })),
  lens: shared(new THREE.MeshStandardMaterial({ color: '#1d1d24', roughness: 0.15, metalness: 0.35 })),
  white: shared(new THREE.MeshStandardMaterial({ color: '#fff8ee', roughness: 0.8 })),
  leather: shared(new THREE.MeshStandardMaterial({ color: '#8a5a35', roughness: 0.75 })),
  painted: shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide })),
};

// Hair cap: a sphere cap tilted back so the hairline sits high at the front.
function capGeo(radius, thetaLength, tilt) {
  const g = new THREE.SphereGeometry(radius, 22, 10, 0, Math.PI * 2, 0, thetaLength);
  g.rotateX(tilt);
  return g;
}

// ---------------------------------------------------------------------------
// Hair (tinted with hairColor). Returns { group, frame } where frame is the
// sphere a hat should sit on: centre (head space) and radius.
// ---------------------------------------------------------------------------

const HAIR_FRAMES = {
  bald: { c: [0, 0, 0], r: 1.0 * R },
  short: { c: [0, 0, 0], r: 1.08 * R },
  braids: { c: [0, 0, 0], r: 1.06 * R },
  dreads: { c: [0, 0, 0], r: 1.08 * R },
  ponytail: { c: [0, 0, 0], r: 1.07 * R },
  bun: { c: [0, 0.06 * R, 0], r: 1.1 * R },
  afro: { c: [0, 0.5 * R, -0.35 * R], r: 1.17 * R },
};

const HAIR_BUILDERS = {
  bald: () => [],

  short: () => [
    cached('hair:short', () =>
      mergeGeometries([
        capGeo(1.07 * R, 1.25, -0.45),
        place(new THREE.SphereGeometry(0.3 * R, 10, 8), { y: 0.93 * R, z: 0.42 * R, sy: 0.6 }),
      ]),
    ),
  ],

  afro: () => [
    cached('hair:afro', () => {
      const puffs = [
        [0, 0.5, -0.35, 1.15], [0.85, 0.12, -0.3, 0.72], [-0.85, 0.12, -0.3, 0.72],
        [0, 0.1, -0.85, 0.8], [0.5, 0.95, -0.1, 0.62], [-0.5, 0.95, -0.1, 0.62], [0, 1.15, -0.45, 0.6],
      ];
      const g = mergeGeometries(puffs.map(([x, y, z, r]) => place(new THREE.IcosahedronGeometry(1, 1), { x: x * R, y: y * R, z: z * R, sx: r * R })));
      return jitter(g, createRng('roots3d:afro'), 0.022);
    }),
  ],

  braids: () => [
    cached('hair:braids', () => {
      const parts = [capGeo(1.04 * R, 1.3, -0.5)];
      for (let i = 0; i < 11; i++) {
        const a = THREE.MathUtils.degToRad(95 + (i * 170) / 10); // sides and back
        for (let k = 0; k < 6; k++) {
          const out = 1.0 * R + k * 0.006;
          parts.push(place(new THREE.IcosahedronGeometry(0.034, 0), {
            x: Math.sin(a) * out, y: -0.05 * R - k * 0.055, z: Math.cos(a) * out,
          }));
        }
      }
      return mergeGeometries(parts);
    }),
    // Gold cuffs at the braid tips (second mesh, gold material).
    { gold: true, geo: cached('hair:braids:cuffs', () => {
      const parts = [];
      for (let i = 0; i < 11; i++) {
        const a = THREE.MathUtils.degToRad(95 + (i * 170) / 10);
        const out = 1.0 * R + 0.036;
        parts.push(place(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 6), {
          x: Math.sin(a) * out, y: -0.05 * R - 6 * 0.055 + 0.01, z: Math.cos(a) * out,
        }));
      }
      return mergeGeometries(parts);
    }) },
  ],

  bun: () => [
    cached('hair:bun', () =>
      mergeGeometries([
        capGeo(1.05 * R, 1.25, -0.45),
        place(new THREE.SphereGeometry(0.42 * R, 14, 10), { y: 0.92 * R, z: -0.42 * R }),
        place(new THREE.TorusGeometry(0.3 * R, 0.06 * R, 6, 16), { y: 0.72 * R, z: -0.36 * R, rx: Math.PI / 2 - 0.5 }),
      ]),
    ),
  ],

  ponytail: () => [
    cached('hair:ponytail', () =>
      mergeGeometries([
        capGeo(1.06 * R, 1.3, -0.45),
        place(new THREE.SphereGeometry(0.17 * R, 10, 8), { y: 0.3 * R, z: -1.02 * R }),
        place(new THREE.CapsuleGeometry(0.14 * R, 0.85 * R, 4, 10), { y: -0.22 * R, z: -1.18 * R, rx: 0.35 }),
      ]),
    ),
  ],

  dreads: () => [
    cached('hair:dreads', () => {
      const parts = [capGeo(1.06 * R, 1.3, -0.45)];
      for (let i = 0; i < 14; i++) {
        const a = THREE.MathUtils.degToRad(70 + (i * 220) / 13);
        const sx = Math.sin(a);
        const cz = Math.cos(a);
        parts.push(place(new THREE.CapsuleGeometry(0.048, 0.24, 3, 6), {
          x: sx * 1.02 * R, y: -0.12 - 0.02 * (i % 3), z: cz * 1.02 * R,
          rx: -cz * 0.18, rz: sx * 0.18,
        }));
      }
      return mergeGeometries(parts);
    }),
  ],
};

export function buildHair(type, mats) {
  const key = HAIR_BUILDERS[type] ? type : 'short';
  const group = new THREE.Group();
  group.name = 'hair';
  for (const item of HAIR_BUILDERS[key]()) {
    if (item.isBufferGeometry) group.add(mesh(item, mats.hair));
    else group.add(mesh(item.geo, item.gold ? FIXED.gold : mats.hair));
  }
  const f = HAIR_FRAMES[key];
  return { group, frame: { center: new THREE.Vector3(...f.c), radius: f.r }, type: key };
}

// Dome hats: a sphere cap in hat units (radius, how far down it reaches from
// the top, in radians) and the builder's tilt. tuckHair() keeps hair inside them.
const HAT_DOMES = {
  cap: { radius: 1.04, theta: 1.15, tilt: -0.12 },
  beanie: { radius: 1.08, theta: 1.3, tilt: -0.25 },
  headwrap: { radius: 1.1, theta: 1.35, tilt: -0.3 },
};
const TUCK = 0.97; // hair under a dome is pulled in to this fraction of its radius

// A dome hat flattens the hair under it, the way a real hat does: hair that
// would poke out through the crown (a short quiff, a bun, the top of an afro)
// is pulled in just under the dome. Hair below the dome's rim (ponytail tails,
// braids) keeps its shape. Call it after buildHat with the same hair.
export function tuckHair(hair, hatType) {
  const dome = HAT_DOMES[hatType];
  if (!dome) return;
  const { center, radius } = hair.frame;
  // Head space → hat unit space: the inverse of how buildHat seats the hat.
  const toHat = new THREE.Matrix4().makeRotationX(-dome.tilt)
    .multiply(new THREE.Matrix4().makeScale(1 / radius, 1 / radius, 1 / radius))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  const toHead = toHat.clone().invert();
  const limit = dome.radius * TUCK;
  const v = new THREE.Vector3();
  hair.group.children.forEach((m, i) => {
    m.geometry = cached(`tuck:${hair.type}:${hatType}:${i}`, () => {
      const g = m.geometry.clone();
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(toHat);
        const len = v.length();
        if (len <= limit || Math.acos(Math.min(1, v.y / len)) >= dome.theta) continue;
        v.multiplyScalar(limit / len).applyMatrix4(toHead);
        pos.setXYZ(k, v.x, v.y, v.z);
      }
      g.computeBoundingSphere();
      return g;
    });
  });
}

// ---------------------------------------------------------------------------
// Hats. Built in unit space (head-frame radius = 1), then scaled and seated on
// the hair frame so every hat sits correctly on every hair type.
// ---------------------------------------------------------------------------

const HAT_BUILDERS = {
  none: () => null,

  cap: (mats) => {
    const g = new THREE.Group();
    const d = HAT_DOMES.cap;
    g.add(mesh(cached('hat:cap:dome', () => mergeGeometries([
      new THREE.SphereGeometry(d.radius, 20, 8, 0, Math.PI * 2, 0, d.theta),
      place(new THREE.SphereGeometry(0.1, 8, 6), { y: d.radius }),
    ])), mats.secondary));
    g.add(mesh(cached('hat:cap:brim', () =>
      place(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 16, 1, false, -Math.PI / 2, Math.PI), { y: 0.42, z: 0.42, rx: 0.12 }),
    ), mats.primary));
    g.rotation.x = d.tilt;
    return g;
  },

  beanie: (mats) => {
    const g = new THREE.Group();
    const d = HAT_DOMES.beanie;
    g.add(mesh(cached('hat:beanie:body', () => new THREE.SphereGeometry(d.radius, 20, 10, 0, Math.PI * 2, 0, d.theta)), mats.primary));
    g.add(mesh(cached('hat:beanie:cuff', () =>
      place(new THREE.TorusGeometry(1.03, 0.11, 6, 28), { y: 0.29, rx: Math.PI / 2 }),
    ), mats.secondary));
    g.add(mesh(cached('hat:beanie:pom', () => place(new THREE.IcosahedronGeometry(0.2, 1), { y: 1.12 })), FIXED.white));
    g.rotation.x = d.tilt;
    return g;
  },

  tophat: (mats) => {
    const g = new THREE.Group();
    g.add(mesh(cached('hat:tophat:body', () => mergeGeometries([
      place(new THREE.CylinderGeometry(0.98, 0.98, 0.05, 28), { y: 0.7 }),
      place(new THREE.CylinderGeometry(0.62, 0.6, 1.1, 22), { y: 1.25 }),
    ])), FIXED.dark));
    g.add(mesh(cached('hat:tophat:band', () => place(new THREE.CylinderGeometry(0.63, 0.63, 0.18, 22), { y: 0.84 })), mats.primary));
    g.rotation.x = -0.08;
    return g;
  },

  crown: () => {
    const geo = cached('hat:crown', () => {
      const parts = [paint(place(new THREE.CylinderGeometry(0.74, 0.7, 0.34, 18, 1, true), { y: 0.82 }), '#e3b23c')];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.sin(a);
        const z = Math.cos(a);
        parts.push(paint(place(new THREE.ConeGeometry(0.11, 0.32, 6), { x: x * 0.72, y: 1.15, z: z * 0.72 }), '#e3b23c'));
        parts.push(paint(place(new THREE.SphereGeometry(0.05, 6, 4), { x: x * 0.72, y: 1.33, z: z * 0.72 }), '#f1d27a'));
        parts.push(paint(place(new THREE.SphereGeometry(0.07, 8, 6), { x: x * 0.75, y: 0.82, z: z * 0.75 }), i % 2 ? '#2f8f6a' : '#c8343b'));
      }
      return mergeGeometries(parts);
    });
    return mesh(geo, FIXED.painted);
  },

  // Extras beyond the documented start.ng options (see NOTES / reply).
  fila: (mats) => {
    const g = new THREE.Group();
    g.add(mesh(cached('hat:fila:body', () => mergeGeometries([
      place(new THREE.CylinderGeometry(0.86, 0.92, 0.55, 22), { y: 0.82 }),
      place(new THREE.SphereGeometry(0.75, 16, 10), { x: 0.33, y: 1.12, rz: -0.35, sx: 1.1, sy: 0.45, sz: 0.9 }),
    ])), mats.secondary));
    g.add(mesh(cached('hat:fila:band', () => place(new THREE.CylinderGeometry(0.94, 0.96, 0.12, 22), { y: 0.52 })), mats.primary));
    g.rotation.x = -0.1;
    return g;
  },

  headwrap: (mats) => {
    const g = new THREE.Group();
    const d = HAT_DOMES.headwrap;
    g.add(mesh(cached('hat:headwrap:dome', () => new THREE.SphereGeometry(d.radius, 20, 10, 0, Math.PI * 2, 0, d.theta)), mats.primary));
    g.add(mesh(cached('hat:headwrap:folds', () => mergeGeometries([
      place(new THREE.TorusGeometry(0.98, 0.12, 6, 26), { y: 0.33, rx: Math.PI / 2 + 0.12 }),
      place(new THREE.TorusGeometry(0.9, 0.1, 6, 26), { y: 0.62, rx: Math.PI / 2 - 0.16 }),
      place(new THREE.SphereGeometry(0.2, 10, 8), { x: -0.13, y: 0.86, z: 0.74 }),
      place(new THREE.SphereGeometry(0.2, 10, 8), { x: 0.13, y: 0.86, z: 0.74 }),
    ])), mats.secondary));
    g.rotation.x = d.tilt;
    return g;
  },
};

export function buildHat(type, frame, mats) {
  const build = HAT_BUILDERS[type] || HAT_BUILDERS.none;
  const hat = build(mats);
  if (!hat) return null;
  const group = new THREE.Group();
  group.name = 'hat';
  group.add(hat);
  group.position.copy(frame.center);
  group.scale.setScalar(frame.radius);
  return group;
}

// ---------------------------------------------------------------------------
// Accessories on the head (head space, radius R)
// Eye centres on the faceplate are at about (±0.058, 0.072, 0.254).
// ---------------------------------------------------------------------------

const EYE_X = 0.058;
const EYE_Y = 0.072;
const FRONT_Z = 0.268;

const HEAD_ACCESSORIES = {
  glasses: () => mesh(cached('acc:glasses', () => mergeGeometries([
    place(new THREE.TorusGeometry(0.058, 0.01, 6, 20), { x: -EYE_X, y: EYE_Y, z: FRONT_Z }),
    place(new THREE.TorusGeometry(0.058, 0.01, 6, 20), { x: EYE_X, y: EYE_Y, z: FRONT_Z }),
    place(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6), { y: EYE_Y + 0.01, z: FRONT_Z, rz: Math.PI / 2 }),
    place(new THREE.BoxGeometry(0.012, 0.012, 0.2), { x: -0.25, y: EYE_Y + 0.01, z: 0.14 }),
    place(new THREE.BoxGeometry(0.012, 0.012, 0.2), { x: 0.25, y: EYE_Y + 0.01, z: 0.14 }),
  ])), FIXED.dark),

  shades: () => {
    const g = new THREE.Group();
    g.add(mesh(cached('acc:shades:lens', () => mergeGeometries([
      place(new THREE.SphereGeometry(0.066, 14, 8), { x: -EYE_X - 0.004, y: EYE_Y, z: FRONT_Z - 0.006, sy: 0.72, sz: 0.3 }),
      place(new THREE.SphereGeometry(0.066, 14, 8), { x: EYE_X + 0.004, y: EYE_Y, z: FRONT_Z - 0.006, sy: 0.72, sz: 0.3 }),
    ])), FIXED.lens));
    g.add(mesh(cached('acc:shades:frame', () => mergeGeometries([
      place(new THREE.BoxGeometry(0.27, 0.018, 0.02), { y: EYE_Y + 0.04, z: FRONT_Z }),
      place(new THREE.BoxGeometry(0.012, 0.014, 0.2), { x: -0.25, y: EYE_Y + 0.035, z: 0.14 }),
      place(new THREE.BoxGeometry(0.012, 0.014, 0.2), { x: 0.25, y: EYE_Y + 0.035, z: 0.14 }),
    ])), FIXED.dark));
    return g;
  },

  earrings: () => mesh(cached('acc:earrings', () => mergeGeometries([
    place(new THREE.TorusGeometry(0.034, 0.008, 6, 16), { x: -0.268, y: -0.09, z: 0.02, ry: Math.PI / 2 }),
    place(new THREE.TorusGeometry(0.034, 0.008, 6, 16), { x: 0.268, y: -0.09, z: 0.02, ry: Math.PI / 2 }),
    place(new THREE.SphereGeometry(0.014, 6, 4), { x: -0.27, y: -0.05, z: 0.02 }),
    place(new THREE.SphereGeometry(0.014, 6, 4), { x: 0.27, y: -0.05, z: 0.02 }),
  ])), FIXED.gold),

  beard: (mats) => mesh(cached('acc:beard', () => mergeGeometries([
    new THREE.SphereGeometry(1.06 * R, 22, 10, Math.PI / 2 - 1.25, 2.5, 1.62, 0.95),
    place(new THREE.CapsuleGeometry(0.022, 0.09, 3, 6), { y: 0.025, z: FRONT_Z + 0.002, rz: Math.PI / 2 }),
  ])), mats.hair),
};

// ---------------------------------------------------------------------------
// Accessories on the body (torso space; neck base at y = 0.5)
// ---------------------------------------------------------------------------

const BODY_ACCESSORIES = {
  scarf: (mats) => mesh(cached('acc:scarf', () => mergeGeometries([
    place(new THREE.TorusGeometry(0.13, 0.055, 8, 20), { y: 0.5, rx: Math.PI / 2 }),
    place(new THREE.BoxGeometry(0.09, 0.24, 0.035), { x: 0.07, y: 0.37, z: 0.17, rz: 0.15, rx: -0.12 }),
  ])), mats.secondary),

  backpack: (mats) => {
    const g = new THREE.Group();
    g.add(mesh(cached('acc:backpack:bag', () => mergeGeometries([
      place(new THREE.BoxGeometry(0.34, 0.38, 0.16), { y: 0.26, z: -0.21 }),
      place(new THREE.BoxGeometry(0.35, 0.12, 0.17), { y: 0.43, z: -0.215, rx: 0.08 }),
      place(new THREE.BoxGeometry(0.22, 0.12, 0.06), { y: 0.14, z: -0.31 }),
    ])), FIXED.leather));
    g.add(mesh(cached('acc:backpack:straps', () => mergeGeometries([
      place(new THREE.BoxGeometry(0.05, 0.4, 0.03), { x: -0.13, y: 0.27, z: 0.155, rx: -0.08 }),
      place(new THREE.BoxGeometry(0.05, 0.4, 0.03), { x: 0.13, y: 0.27, z: 0.155, rx: -0.08 }),
    ])), mats.secondary));
    return g;
  },

  // Extra beyond the documented start.ng options: a coral-and-gold bead necklace.
  beads: () => mesh(cached('acc:beads', () => {
    const parts = [];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const front = Math.max(0, Math.cos(a));
      parts.push(paint(place(new THREE.IcosahedronGeometry(0.022, 1), {
        x: Math.sin(a) * 0.15, y: 0.47 - front * 0.07, z: Math.cos(a) * 0.12,
      }), i % 3 === 0 ? '#e3b23c' : '#d2462f'));
    }
    return mergeGeometries(parts);
  }), FIXED.painted),
};

// Returns { head, body } groups (either may be null) for an accessory value.
export function buildAccessory(type, mats) {
  const head = HEAD_ACCESSORIES[type]?.(mats) || null;
  const body = BODY_ACCESSORIES[type]?.(mats) || null;
  if (head) head.name = 'accessory';
  if (body) body.name = 'accessory';
  return { head, body };
}
