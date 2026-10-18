// Artifact models for the Heritage Plaza (plaza.js). Each kind is two merged,
// vertex-coloured geometries: `base` in fixed natural colours (wood, clay,
// bronze, straw) and `accent` in white, tinted per instance with the culture's
// attire colour. All are small, stylised and respectful (CLAUDE.md §7), about
// 0.4 units tall, standing on y = 0 (the plinth top).
//
// artifactKindFor() picks a kind from the culture's npc data and region.

import * as THREE from 'three';
import { place, paint, mergeGeometries } from './geom.js';

export const ARTIFACT_KINDS = Object.freeze(['drum', 'beaded-crown', 'basket', 'stool', 'jar', 'bronze-head', 'calabash', 'mask']);

export const ARTIFACT_NAMES = Object.freeze({
  drum: 'Talking drum',
  'beaded-crown': 'Beaded crown',
  basket: 'Woven basket',
  stool: 'Carved stool',
  jar: 'Pottery jar',
  'bronze-head': 'Bronze head',
  calabash: 'Carved calabash',
  mask: 'Mask on a stand',
});

// Cast-metal heads are a celebrated art of these origins (Ife, Benin).
const BRONZE = { naija: new Set(['edo', 'yoruba']), africa: new Set(['nga']) };
const NORTHERN = new Set(['north-west', 'north-east', 'north']);
// Masks only where masquerade traditions are widely known; elsewhere a fan or
// horn prop maps to a jar (north) or a calabash. See REVIEW.md §10.
const MASK_GROUPS = new Set(['south-east', 'south-south', 'south-west', 'north-central', 'west', 'central']);

// The artifact a solved origin awards. origin: a tribe or country record.
export function artifactKindFor(mode, origin) {
  if (BRONZE[mode]?.has(origin.id)) return 'bronze-head';
  const { headgear, prop } = origin.npc;
  if (headgear === 'crown' || headgear === 'beaded-crown') return 'beaded-crown';
  const group = mode === 'naija' ? origin.zones[0] : origin.region;
  switch (prop) {
    case 'talking-drum': return 'drum';
    case 'woven-basket': return 'basket';
    case 'calabash': return 'calabash';
    case 'beads': return 'beaded-crown';
    case 'fan':
    case 'horn':
      if (MASK_GROUPS.has(group)) return 'mask';
      return NORTHERN.has(group) ? 'jar' : 'calabash';
    case 'staff':
    case 'walking-stick': return NORTHERN.has(group) ? 'jar' : 'stool';
    default: return 'jar';
  }
}

const WOOD = '#8a5a35';
const WOOD_DARK = '#5e3b22';
const CLAY = '#b8693e';
const STRAW = '#d9b46a';
const BRONZE_COLOR = '#a8743a';
const GOURD = '#d8b77c';
const INK = '#2b2118';
const W = '#ffffff';
const SOFT = '#d9d4cc'; // shaded accent detail

function lathe(points, segments = 14) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

function ring(r, tube, y) {
  return place(new THREE.TorusGeometry(r, tube, 6, 16), { y, rx: Math.PI / 2 });
}

const BUILDERS = {
  drum() {
    const body = lathe([[0, 0.04], [0.1, 0.04], [0.11, 0.08], [0.065, 0.2], [0.11, 0.32], [0.1, 0.36], [0, 0.36]]);
    return {
      base: mergeGeometries([
        paint(body, WOOD),
        paint(place(new THREE.CylinderGeometry(0.12, 0.13, 0.04, 14), { y: 0.02 }), WOOD_DARK),
      ]),
      accent: mergeGeometries([
        paint(ring(0.108, 0.014, 0.08), W),
        paint(ring(0.108, 0.014, 0.32), W),
        paint(ring(0.068, 0.012, 0.2), SOFT),
      ]),
    };
  },
  'beaded-crown'() {
    const crown = lathe([[0.1, 0.1], [0.11, 0.14], [0.085, 0.26], [0.05, 0.36], [0, 0.4]]);
    return {
      base: mergeGeometries([
        paint(place(new THREE.CylinderGeometry(0.14, 0.15, 0.1, 14), { y: 0.05 }), WOOD_DARK),
        paint(place(new THREE.SphereGeometry(0.03, 10, 8), { y: 0.42 }), '#e3b23c'),
      ]),
      accent: mergeGeometries([
        paint(crown, W),
        paint(ring(0.104, 0.012, 0.16), SOFT),
        paint(ring(0.082, 0.011, 0.24), SOFT),
        paint(ring(0.06, 0.01, 0.31), SOFT),
      ]),
    };
  },
  basket() {
    const bowl = lathe([[0, 0.02], [0.09, 0.02], [0.15, 0.1], [0.17, 0.2], [0.16, 0.22]]);
    return {
      base: mergeGeometries([
        paint(ring(0.16, 0.016, 0.22), STRAW),
        paint(place(new THREE.TorusGeometry(0.12, 0.012, 6, 16, Math.PI), { y: 0.22 }), STRAW),
      ]),
      accent: mergeGeometries([paint(bowl, W), paint(ring(0.168, 0.01, 0.13), SOFT)]),
    };
  },
  stool() {
    return {
      base: mergeGeometries([
        paint(place(new THREE.BoxGeometry(0.3, 0.035, 0.18), { y: 0.02 }), WOOD_DARK),
        paint(place(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 10), { y: 0.135 }), WOOD),
        paint(place(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 16, 1, false, 0, Math.PI), { y: 0.27, rz: Math.PI / 2, sx: 0.28, sz: 0.62 }), WOOD),
      ]),
      accent: mergeGeometries([paint(ring(0.062, 0.016, 0.13), W), paint(ring(0.07, 0.012, 0.07), SOFT)]),
    };
  },
  jar() {
    const body = lathe([[0, 0], [0.07, 0], [0.14, 0.08], [0.15, 0.16], [0.11, 0.26], [0.06, 0.31], [0.07, 0.35], [0.05, 0.35]]);
    return {
      base: paint(body, CLAY),
      accent: mergeGeometries([paint(ring(0.148, 0.014, 0.15), W), paint(ring(0.125, 0.011, 0.22), SOFT)]),
    };
  },
  'bronze-head'() {
    return {
      base: mergeGeometries([
        paint(place(new THREE.CylinderGeometry(0.11, 0.13, 0.06, 14), { y: 0.03 }), WOOD_DARK),
        paint(place(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12), { y: 0.11 }), BRONZE_COLOR),
        paint(place(new THREE.SphereGeometry(0.1, 14, 12), { y: 0.25, sy: 1.15, sz: 0.95 }), BRONZE_COLOR),
        paint(place(new THREE.BoxGeometry(0.05, 0.01, 0.01), { x: -0.035, y: 0.27, z: 0.093 }), INK),
        paint(place(new THREE.BoxGeometry(0.05, 0.01, 0.01), { x: 0.035, y: 0.27, z: 0.093 }), INK),
      ]),
      accent: mergeGeometries([
        paint(ring(0.075, 0.016, 0.08), W),
        paint(ring(0.07, 0.015, 0.11), SOFT),
        paint(ring(0.066, 0.014, 0.14), W),
      ]),
    };
  },
  calabash() {
    const gourd = lathe([[0, 0.03], [0.1, 0.05], [0.14, 0.13], [0.12, 0.22], [0.07, 0.27], [0.06, 0.3], [0.03, 0.34], [0, 0.35]]);
    return {
      base: mergeGeometries([paint(gourd, GOURD), paint(ring(0.09, 0.018, 0.03), WOOD_DARK)]),
      accent: mergeGeometries([paint(ring(0.14, 0.011, 0.13), W), paint(ring(0.118, 0.01, 0.2), SOFT)]),
    };
  },
  mask() {
    const face = place(new THREE.SphereGeometry(0.1, 14, 10, -Math.PI / 2, Math.PI), { y: 0.28, z: 0.02, sy: 1.5, sz: 0.55 });
    return {
      base: mergeGeometries([
        paint(place(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 12), { y: 0.02 }), WOOD_DARK),
        paint(place(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), { y: 0.13 }), WOOD),
        paint(place(new THREE.BoxGeometry(0.035, 0.012, 0.01), { x: -0.035, y: 0.31, z: 0.075 }), INK),
        paint(place(new THREE.BoxGeometry(0.035, 0.012, 0.01), { x: 0.035, y: 0.31, z: 0.075 }), INK),
        paint(place(new THREE.BoxGeometry(0.012, 0.06, 0.012), { y: 0.26, z: 0.078 }), WOOD_DARK),
      ]),
      accent: paint(face, W),
    };
  },
};

// { kind: { base, accent } } geometries, built once.
export function createArtifactGeometries() {
  const out = {};
  for (const kind of ARTIFACT_KINDS) out[kind] = BUILDERS[kind]();
  return out;
}

// The stone plinth every monument stands on (top at y = 0.1).
export function plinthGeometry() {
  return mergeGeometries([
    paint(place(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 8), { y: 0.0 }), '#b9a888'),
    paint(place(new THREE.CylinderGeometry(0.18, 0.2, 0.06, 8), { y: 0.07 }), '#d2c2a2'),
  ]);
}
