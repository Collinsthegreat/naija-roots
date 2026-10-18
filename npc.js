// The Mystery Cultural Storyteller on the right pedestal.
// A calm, stylised elder in a flowing robe (CLAUDE.md §7: respectful, never a
// caricature). It starts as a dark silhouette with a soft rim glow, and each
// reveal stage uncovers more of the culture's attire, all animated from sim time.
//
// Culture object (from the data in later steps):
//   { colors: [hex, hex, hex?], headgear, prop, pose?, pattern? }
//   headgear: gele | fila | cap | turban | crown | beaded-crown | headwrap | none
//   prop:     talking-drum | staff | fan | calabash | horn | walking-stick | woven-basket | beads
//   pose:     standing | gesturing | presenting | drumming (defaults from the prop)
//   pattern:  zigzag | diamond | stripes (defaults from the colours)

import * as THREE from 'three';
import { place, paint, mergeGeometries, shared, disposeObject, smoothstep, clamp } from './geom.js';
import { createPatternTexture } from './textures.js';
import { hashString } from './rng.js';
import { HEADGEAR_TYPES, PROP_TYPES, headgearParts, propParts } from './npc-parts.js';

const HEAD_R = 0.2;
const HEAD_Y = 1.48;
const SHOULDER = [0.27, 1.16];
const HAND_Y = -0.53;
const TRANSITION = 0.6; // seconds per reveal step
const DARK = new THREE.Color('#17110c');
const SKIN = '#6b4226';
const RIM_COLOR = '#ffcf85';

// Stage at which each part is revealed.
const STAGE_OF = { attire: 2, trim: 3, headShape: 4, headColor: 5, prop: 6, beads: 7, full: 8 };

const POSES = {
  standing: { l: [0, -0.15], r: [-0.3, 0.15] },
  gesturing: { l: [0, -0.15], r: [-1.9, 0.35] },
  presenting: { l: [-0.9, 0.25], r: [-0.9, -0.25] },
  drumming: { l: [-0.25, -0.55], r: [-0.95, -0.35] },
};
const CELEBRATE_POSE = { l: [-2.5, -0.35], r: [-2.5, 0.35] };
const PATTERNS = ['zigzag', 'diamond', 'stripes'];

// Eight neutral sample cultures (one per headgear and prop) for previews and the
// ?npc debug view. They are not tied to any real group's data.
export const SAMPLE_CULTURES = Object.freeze([
  { id: 'sample-1', colors: ['#7b2d8e', '#e3b23c', '#1f6f5c'], headgear: 'gele', prop: 'talking-drum', pattern: 'zigzag' },
  { id: 'sample-2', colors: ['#1f5fa8', '#f1e3c3', '#c8643b'], headgear: 'fila', prop: 'staff', pattern: 'stripes' },
  { id: 'sample-3', colors: ['#2f7d4f', '#f4efe3', '#c8343b'], headgear: 'cap', prop: 'fan', pattern: 'diamond' },
  { id: 'sample-4', colors: ['#f3efe6', '#3a6fb0', '#e3b23c'], headgear: 'turban', prop: 'horn', pattern: 'stripes' },
  { id: 'sample-5', colors: ['#b3261e', '#e3b23c', '#2b2118'], headgear: 'crown', prop: 'walking-stick', pattern: 'diamond' },
  { id: 'sample-6', colors: ['#f2efe7', '#d2462f', '#2f6db5'], headgear: 'beaded-crown', prop: 'beads', pattern: 'zigzag' },
  { id: 'sample-7', colors: ['#e07a2f', '#3d6b3a', '#f6e7c1'], headgear: 'headwrap', prop: 'calabash', pattern: 'zigzag' },
  { id: 'sample-8', colors: ['#5b3a8c', '#e8c26a', '#2a8a8a'], headgear: 'none', prop: 'woven-basket', pattern: 'stripes' },
]);

const HEX6 = /^#[0-9a-f]{6}$/i;

export function normaliseCulture(c) {
  const src = c && typeof c === 'object' ? c : {};
  const colors = (Array.isArray(src.colors) ? src.colors : []).filter((x) => typeof x === 'string' && HEX6.test(x));
  const base = ['#7a5230', '#e3b23c', '#2f6db5'];
  while (colors.length < 3) colors.push(base[colors.length]);
  const prop = PROP_TYPES.includes(src.prop) ? src.prop : 'staff';
  const parts = propParts(prop);
  return {
    id: typeof src.id === 'string' ? src.id : 'unknown',
    colors: colors.slice(0, 3),
    headgear: HEADGEAR_TYPES.includes(src.headgear) ? src.headgear : 'none',
    prop,
    pose: POSES[src.pose] ? src.pose : parts.pose,
    pattern: PATTERNS.includes(src.pattern) ? src.pattern : PATTERNS[hashString(colors.join()) % PATTERNS.length],
  };
}

// ---------------------------------------------------------------------------
// Rim-lit material: a fresnel glow added to emissive, so the silhouette reads
// without adding any light to the scene (CLAUDE.md §2: one directional light).
// ---------------------------------------------------------------------------

function rimMaterial(rim, params) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, ...params });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rim.strength;
    shader.uniforms.uRimColor = rim.color;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          totalEmissiveRadiance += uRimColor * pow(rimF, 2.4) * uRim;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'roots3d-rim';
  return m;
}

// ---------------------------------------------------------------------------
// Static body geometry (shared between storytellers)
// ---------------------------------------------------------------------------

const geoCache = new Map();
function geo(key, build) {
  if (!geoCache.has(key)) geoCache.set(key, shared(build()));
  return geoCache.get(key);
}

const ROBE_PROFILE = [[0, 0], [0.4, 0], [0.39, 0.1], [0.34, 0.42], [0.29, 0.78], [0.27, 1.0], [0.29, 1.12], [0.26, 1.2], [0.13, 1.27], [0, 1.29]];

const BODY_GEO = {
  robe: () => geo('npc:robe', () => place(new THREE.LatheGeometry(ROBE_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 26), { sz: 0.8 })),
  hem: () => geo('npc:hem', () => place(new THREE.CylinderGeometry(0.402, 0.398, 0.1, 26, 1, true), { y: 0.06, sz: 0.8 })),
  stole: () => geo('npc:stole', () => place(new THREE.LatheGeometry(
    ROBE_PROFILE.slice(2, 8).map(([r, y]) => new THREE.Vector2(r + 0.008, y)), 8, -0.2, 0.4,
  ), { sz: 0.8 })),
  neck: () => geo('npc:neck', () => place(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10), { y: 1.3 })),
  head: () => geo('npc:head', () => new THREE.SphereGeometry(HEAD_R, 22, 16)),
  features: () => geo('npc:features', () => mergeGeometries([
    place(new THREE.TorusGeometry(0.03, 0.008, 4, 10, Math.PI), { x: -0.07, y: 0.02, z: 0.19, rz: Math.PI }),
    place(new THREE.TorusGeometry(0.03, 0.008, 4, 10, Math.PI), { x: 0.07, y: 0.02, z: 0.19, rz: Math.PI }),
    place(new THREE.TorusGeometry(0.045, 0.009, 4, 12, Math.PI), { y: -0.055, z: 0.193, rz: Math.PI }),
  ])),
  sleeve: () => geo('npc:sleeve', () => place(new THREE.CylinderGeometry(0.07, 0.15, 0.5, 14), { y: -0.25 })),
  sleeveTrim: () => geo('npc:sleeveTrim', () => place(new THREE.CylinderGeometry(0.153, 0.153, 0.05, 14, 1, true), { y: -0.47 })),
  hand: () => geo('npc:hand', () => place(new THREE.SphereGeometry(0.055, 10, 8), { y: HAND_Y })),
  necklace: () => geo('npc:necklace', () => {
    const parts = [];
    [[0.17, 0.14, 1.23, 0.08, 20], [0.2, 0.16, 1.22, 0.17, 24]].forEach(([rx, rz, y, dip, n], s) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const front = Math.max(0, Math.cos(a));
        parts.push(paint(place(new THREE.IcosahedronGeometry(0.024, 1), {
          x: Math.sin(a) * rx, y: y - front * dip, z: Math.cos(a) * rz,
        }), (i + s) % 3 === 0 ? '#e3b23c' : '#d2462f'));
      }
    });
    return mergeGeometries(parts);
  }),
  bracelet: () => geo('npc:bracelet', () => {
    const parts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      parts.push(paint(place(new THREE.IcosahedronGeometry(0.018, 0), { x: Math.sin(a) * 0.06, y: HAND_Y + 0.05, z: Math.cos(a) * 0.06 }),
        i % 2 ? '#e3b23c' : '#d2462f'));
    }
    return mergeGeometries(parts);
  }),
};

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const easeBackOut = (x) => {
  const t = clamp(x, 0, 1);
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// ---------------------------------------------------------------------------
// The storyteller
// ---------------------------------------------------------------------------

// Returns { root, setTarget(culture), setRevealStage(n), celebrate(), update(dt),
// reset(), stage, culture, dispose() }. update(dt) must run in the sim step.
export function createStoryteller() {
  const rim = { strength: { value: 1.25 }, color: { value: new THREE.Color(RIM_COLOR) } };
  const registry = []; // { mat, target: Color, channel, owned }
  const channels = {};
  for (const key of Object.keys(STAGE_OF)) channels[key] = { v: 0, goal: 0 };

  function register(mat, target, channel, owned = true) {
    registry.push({ mat, target: new THREE.Color(target), channel, owned });
    mat.color.copy(DARK);
    return mat;
  }

  const root = new THREE.Group();
  root.name = 'storyteller';
  const body = new THREE.Group();
  root.add(body);

  // Body materials (live for the storyteller's lifetime).
  const robeMat = register(rimMaterial(rim, {}), '#ffffff', 'attire', false);
  const trimMat = register(rimMaterial(rim, { side: THREE.DoubleSide }), '#ffffff', 'trim', false);
  const stoleMat = register(rimMaterial(rim, { side: THREE.DoubleSide }), '#ffffff', 'trim', false);
  const skinMat = register(rimMaterial(rim, { roughness: 0.65 }), SKIN, 'full', false);
  const featureMat = register(rimMaterial(rim, { roughness: 0.6 }), '#2e1c12', 'full', false);
  const beadMat = register(rimMaterial(rim, { vertexColors: true, roughness: 0.4, metalness: 0.2 }), '#ffffff', 'beads', false);

  body.add(shadowed(new THREE.Mesh(BODY_GEO.robe(), robeMat)));
  body.add(shadowed(new THREE.Mesh(BODY_GEO.hem(), trimMat)));
  body.add(shadowed(new THREE.Mesh(BODY_GEO.stole(), stoleMat)));
  body.add(shadowed(new THREE.Mesh(BODY_GEO.neck(), skinMat)));

  const head = new THREE.Group();
  head.name = 'head';
  head.add(shadowed(new THREE.Mesh(BODY_GEO.head(), skinMat)));
  head.add(new THREE.Mesh(BODY_GEO.features(), featureMat));
  const headgearHolder = new THREE.Group(); // at the head centre
  head.add(headgearHolder);
  head.position.y = HEAD_Y; // the head pivots at its own centre
  body.add(head);

  const beads = [shadowed(new THREE.Mesh(BODY_GEO.necklace(), beadMat))];
  body.add(beads[0]);

  const arms = {};
  const holders = {};
  for (const [side, sx] of [['l', -1], ['r', 1]]) {
    const arm = new THREE.Group();
    arm.name = side === 'l' ? 'leftArm' : 'rightArm';
    arm.position.set(sx * SHOULDER[0], SHOULDER[1], 0);
    arm.add(shadowed(new THREE.Mesh(BODY_GEO.sleeve(), robeMat)));
    arm.add(shadowed(new THREE.Mesh(BODY_GEO.sleeveTrim(), trimMat)));
    arm.add(shadowed(new THREE.Mesh(BODY_GEO.hand(), skinMat)));
    const bracelet = shadowed(new THREE.Mesh(BODY_GEO.bracelet(), beadMat));
    arm.add(bracelet);
    beads.push(bracelet);
    const holder = new THREE.Group(); // prop holder at the hand
    holder.position.y = HAND_Y;
    holder.rotation.order = 'ZYX'; // inverse of the arm's XYZ, for upright props
    arm.add(holder);
    body.add(arm);
    arms[side] = arm;
    holders[side] = holder;
  }

  // Culture-specific state
  let culture = null;
  let pose = POSES.standing;
  let headgear = null;
  const props = { l: null, r: null };
  const upright = { l: false, r: false };
  let patternTex = null;
  let stoleTex = null;
  let stage = 1;
  let t = 0;
  let celebrateLeft = 0;

  function clearCulture() {
    if (headgear) disposeObject(headgear);
    headgear = null;
    for (const side of ['l', 'r']) {
      if (props[side]) disposeObject(props[side]);
      props[side] = null;
      upright[side] = false;
    }
    for (let i = registry.length - 1; i >= 0; i--) if (registry[i].owned) registry.splice(i, 1);
    patternTex?.dispose();
    stoleTex?.dispose();
  }

  function buildGroup(parts, mats, name) {
    const group = new THREE.Group();
    group.name = name;
    for (const { geo: g, mat } of parts) group.add(shadowed(new THREE.Mesh(g, mats[mat] || mats.main)));
    return group;
  }

  function setTarget(input) {
    clearCulture();
    culture = normaliseCulture(input);
    const [c0, c1, c2] = culture.colors;
    pose = POSES[culture.pose];

    // Attire colour and woven trim pattern
    registry.find((r) => r.mat === robeMat).target.set(c0);
    patternTex = createPatternTexture([c1, c2, c0], culture.pattern);
    patternTex.repeat.set(6, 1);
    stoleTex = createPatternTexture([c1, c2, c0], culture.pattern);
    stoleTex.center.set(0.5, 0.5);
    stoleTex.rotation = Math.PI / 2;
    stoleTex.repeat.set(4, 1);
    trimMat.map = patternTex;
    stoleMat.map = stoleTex;
    trimMat.needsUpdate = true;
    stoleMat.needsUpdate = true;

    // Headgear: shape at stage 4, colour at stage 5
    const hgMats = {
      main: register(rimMaterial(rim, {}), c1, 'headColor'),
      accent: register(rimMaterial(rim, {}), c2, 'headColor'),
      gold: register(rimMaterial(rim, { roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide }), '#e3b23c', 'headColor'),
      painted: register(rimMaterial(rim, { vertexColors: true, roughness: 0.4 }), '#ffffff', 'headColor'),
    };
    headgear = buildGroup(headgearParts(culture.headgear), hgMats, 'headgear');
    headgear.scale.setScalar(HEAD_R);
    headgearHolder.add(headgear);

    // Prop at stage 6 (shape and colour together)
    const basketTex = createPatternTexture([c1, c2, c0], 'stripes');
    basketTex.repeat.set(3, 1);
    const propMats = {
      wood: register(rimMaterial(rim, {}), '#7a4b2a', 'prop'),
      leather: register(rimMaterial(rim, { side: THREE.DoubleSide }), '#a8703f', 'prop'),
      cream: register(rimMaterial(rim, { roughness: 0.5 }), '#efe2c4', 'prop'),
      gourd: register(rimMaterial(rim, { side: THREE.DoubleSide }), '#c8955a', 'prop'),
      gold: register(rimMaterial(rim, { roughness: 0.35, metalness: 0.55 }), '#e3b23c', 'prop'),
      main: register(rimMaterial(rim, {}), c1, 'prop'),
      accent: register(rimMaterial(rim, {}), c2, 'prop'),
      pattern: register(rimMaterial(rim, { map: basketTex, side: THREE.DoubleSide }), '#ffffff', 'prop'),
      painted: register(rimMaterial(rim, { vertexColors: true, roughness: 0.4 }), '#ffffff', 'prop'),
    };
    const spec = propParts(culture.prop);
    const mainSide = spec.hand === 'left' ? 'l' : 'r';
    const pieces = [[mainSide, spec]];
    if (spec.other) pieces.push([mainSide === 'l' ? 'r' : 'l', spec.other]);
    for (const [side, piece] of pieces) {
      const group = buildGroup(piece.parts, propMats, 'prop');
      const wrap = new THREE.Group();
      wrap.add(group);
      group.position.set(...piece.offset);
      holders[side].add(wrap);
      props[side] = wrap;
      upright[side] = !!piece.upright;
    }

    setRevealStage(1);
    snap();
    return culture;
  }

  function setRevealStage(n) {
    stage = clamp(Math.round(Number(n) || 1), 1, 8);
    for (const [key, at] of Object.entries(STAGE_OF)) channels[key].goal = stage >= at ? 1 : 0;
  }

  function celebrate() {
    setRevealStage(8);
    celebrateLeft = 2.6;
  }

  function snap() {
    for (const ch of Object.values(channels)) ch.v = ch.goal;
    apply();
  }

  // Replays from sim time 0: same culture and stage, transitions settled.
  function reset() {
    t = 0;
    celebrateLeft = 0;
    snap();
  }

  function eased(key) {
    return smoothstep(channels[key].v);
  }

  function apply() {
    for (const r of registry) r.mat.color.copy(DARK).lerp(r.target, eased(r.channel));
    const hs = easeBackOut(channels.headShape.v);
    if (headgear) {
      headgear.visible = channels.headShape.v > 0.001;
      headgear.scale.setScalar(HEAD_R * Math.max(hs, 0.001));
    }
    const ps = easeBackOut(channels.prop.v);
    for (const side of ['l', 'r']) {
      if (!props[side]) continue;
      props[side].visible = channels.prop.v > 0.001;
      props[side].scale.setScalar(Math.max(ps, 0.001));
    }
    const bs = Math.max(eased('beads'), 0.001);
    for (const b of beads) {
      b.visible = channels.beads.v > 0.001;
      b.scale.setScalar(bs);
    }
    // Strong rim while mysterious, a faint one once fully revealed.
    rim.strength.value = 1.25 + (0.12 - 1.25) * eased('full');
  }

  function update(dt) {
    t += dt;
    const step = dt / TRANSITION;
    for (const ch of Object.values(channels)) {
      if (ch.v < ch.goal) ch.v = Math.min(ch.goal, ch.v + step);
      else if (ch.v > ch.goal) ch.v = Math.max(ch.goal, ch.v - step);
    }
    apply();

    // Idle: calm breathing sway; a happier bounce once fully revealed.
    const full = eased('full');
    let w = 0;
    if (celebrateLeft > 0) {
      celebrateLeft = Math.max(0, celebrateLeft - dt);
      const elapsed = 2.6 - celebrateLeft;
      w = smoothstep(Math.min(elapsed / 0.3, celebrateLeft / 0.5, 1));
    }
    body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.015 * full + Math.abs(Math.sin(t * 7)) * 0.07 * w;
    body.rotation.z = Math.sin(t * 0.6) * (0.015 + 0.02 * full);
    head.rotation.x = Math.sin(t * 0.7) * 0.04 - 0.15 * w;
    head.position.y = HEAD_Y + Math.sin(t * 1.8) * 0.004;

    for (const side of ['l', 'r']) {
      const [px, pz] = pose[side];
      const [cx, cz] = CELEBRATE_POSE[side];
      const talk = side === 'r' && pose === POSES.gesturing ? Math.sin(t * 1.3) * 0.1 : 0;
      const sway = Math.sin(t * 1.1 + (side === 'l' ? 0 : 1.7)) * 0.04;
      const ax = px + talk + sway + (cx - px) * w;
      const az = pz + (cz - pz) * w;
      arms[side].rotation.set(ax, 0, az);
      // Upright props (staff, stick, fan…) stay vertical whatever the arm does.
      if (upright[side]) holders[side].rotation.set(-ax, 0, -az);
      else holders[side].rotation.set(0, 0, 0);
    }
  }

  function dispose() {
    clearCulture();
    for (const r of registry) r.mat.dispose();
    registry.length = 0;
    disposeObject(root);
  }

  setTarget(SAMPLE_CULTURES[0]);

  return {
    root,
    setTarget,
    setRevealStage,
    celebrate,
    update,
    reset,
    dispose,
    get stage() {
      return stage;
    },
    get culture() {
      return culture;
    },
  };
}
