// The player's start.ng explorer, drawn from their start.ng `style` (NOTES §3:
// the character rule). Every style field visibly changes the model:
//   body → torso/shoulder proportions (and skirt vs trousers)
//   skinColor → head, ears, neck, hands (and legs under a skirt)
//   primaryColor → tunic, shoulders, sleeves, hover-drone shell, guess flag
//   secondaryColor → trousers/skirt, belt, collar, cuffs, boots (darker), pedestal ring, arcs
//   hair + hairColor, hat, accessory → distinct meshes (avatar-parts.js)
//   face → start.ng face PNG on the faceplate and flag, or a friendly drawn face

import * as THREE from 'three';
import { HEAD_RADIUS, FIXED, buildHair, buildHat, buildAccessory, tuckHair } from './avatar-parts.js';
import { createFaceTexture } from './textures.js';
import { normaliseStyle } from './startng.js';
import { hashString } from './rng.js';
import { place, shared, shade, mergeGeometries, disposeObject } from './geom.js';

const R = HEAD_RADIUS;
const HIP_Y = 0.6;
const HEAD_Y = 0.84; // head centre above the hips
const DRONE_HOME = new THREE.Vector3(0.5, 1.95, -0.1);

const geoCache = new Map();
function geo(key, build) {
  if (!geoCache.has(key)) geoCache.set(key, shared(build()));
  return geoCache.get(key);
}

const WOOD = shared(new THREE.MeshStandardMaterial({ color: '#8a5a35', roughness: 0.8 }));
const DRONE_GLOW = shared(new THREE.MeshStandardMaterial({ color: '#c9f7ff', emissive: '#7fe6ff', emissiveIntensity: 1.3, roughness: 0.3 }));
const ROTOR = shared(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }));

// Face textures are shared per (face picture, look); they are small and few.
const faceCache = new Map();
function faceTextureFor(style, face) {
  const key = face || `drawn:${style.skinColor}:${style.hairColor}:${style.body}`;
  if (!faceCache.has(key)) faceCache.set(key, shared(createFaceTexture(style, face)));
  return faceCache.get(key);
}

function part(geometry, material, { cast = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function makeMaterials(style, faceTex) {
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...extra });
  return {
    skin: std(style.skinColor, { roughness: 0.6 }),
    primary: std(style.primaryColor),
    secondary: std(style.secondaryColor),
    boots: std(shade(style.secondaryColor, -0.38), { roughness: 0.65 }),
    hair: std(style.hairColor, { roughness: 0.85, side: THREE.DoubleSide }),
    face: new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.6 }),
  };
}

// ---------------------------------------------------------------------------
// Body proportions
// ---------------------------------------------------------------------------

const BODY = {
  male: {
    torso: [[0, 0], [0.2, 0], [0.215, 0.12], [0.25, 0.32], [0.27, 0.42], [0.24, 0.48], [0.12, 0.52], [0, 0.53]],
    shoulderX: 0.27, shoulderY: 0.43, shoulderR: 0.1, sleeveR: 0.068, cuffR: 0.075,
  },
  female: {
    torso: [[0, 0], [0.19, 0], [0.165, 0.14], [0.19, 0.3], [0.215, 0.4], [0.19, 0.47], [0.1, 0.51], [0, 0.52]],
    shoulderX: 0.215, shoulderY: 0.41, shoulderR: 0.08, sleeveR: 0.058, cuffR: 0.065,
  },
};

function buildArm(side, dims, mats, bodyKey) {
  const arm = new THREE.Group();
  arm.name = side < 0 ? 'leftArm' : 'rightArm';
  arm.position.set(side * dims.shoulderX, dims.shoulderY, 0);
  arm.add(part(geo(`arm:sleeve:${bodyKey}`, () => place(new THREE.CapsuleGeometry(dims.sleeveR, 0.26, 4, 10), { y: -0.19 })), mats.primary));
  arm.add(part(geo(`arm:cuff:${bodyKey}`, () => place(new THREE.CylinderGeometry(dims.cuffR, dims.cuffR, 0.04, 10), { y: -0.36 })), mats.secondary));
  arm.add(part(geo('arm:hand', () => place(new THREE.SphereGeometry(0.062, 12, 8), { y: -0.42 })), mats.skin));
  arm.rotation.z = side * 0.12;
  return arm;
}

function buildLeg(side, mats, female) {
  const leg = new THREE.Group();
  leg.name = side < 0 ? 'leftLeg' : 'rightLeg';
  leg.position.set(side * 0.1, 0, 0);
  leg.add(part(geo('leg', () => place(new THREE.CapsuleGeometry(0.075, 0.36, 4, 10), { y: -0.27 })), female ? mats.skin : mats.secondary));
  leg.add(part(geo('boot', () => place(new THREE.BoxGeometry(0.15, 0.12, 0.24), { y: -0.54, z: 0.03 })), mats.boots));
  return leg;
}

function buildHead(style, mats) {
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = HEAD_Y;
  head.add(part(geo('head', () => place(new THREE.SphereGeometry(R, 24, 18), { sy: 1.02, sz: 0.96 })), mats.skin));
  head.add(part(geo('ears', () => {
    const l = place(new THREE.SphereGeometry(0.05, 8, 6), { x: -R * 0.97, sz: 0.6 });
    const r = place(new THREE.SphereGeometry(0.05, 8, 6), { x: R * 0.97, sz: 0.6 });
    return mergeGeometries([l, r]);
  }), mats.skin));

  // Faceplate: a front patch of the head sphere carrying the face texture.
  const faceplate = part(
    geo('faceplate', () => place(new THREE.SphereGeometry(R * 1.012, 20, 14, Math.PI / 2 - 0.8, 1.6, 0.62, 1.3), { sy: 1.02, sz: 0.96 })),
    mats.face,
    { cast: false },
  );
  faceplate.name = 'faceplate';
  head.add(faceplate);

  const hair = buildHair(style.hair, mats);
  head.add(hair.group);
  const hat = buildHat(style.hat, hair.frame, mats);
  if (hat) {
    head.add(hat);
    tuckHair(hair, style.hat); // no hair poking out through the crown
  }
  return { head, faceplate };
}

function buildDrone(mats) {
  const drone = new THREE.Group();
  drone.name = 'drone';
  drone.position.copy(DRONE_HOME);
  drone.add(part(geo('drone:shell', () => place(new THREE.SphereGeometry(0.1, 16, 10), { sy: 0.55 })), mats.primary));
  drone.add(part(geo('drone:ring', () => place(new THREE.TorusGeometry(0.112, 0.018, 6, 22), { rx: Math.PI / 2 })), mats.secondary));
  drone.add(part(geo('drone:lens', () => place(new THREE.SphereGeometry(0.034, 10, 8), { z: 0.088 })), DRONE_GLOW, { cast: false }));
  drone.add(part(geo('drone:arms', () => place(new THREE.BoxGeometry(0.36, 0.014, 0.022), { y: 0.03 })), FIXED.dark));
  const rotors = [-1, 1].map((s) => {
    const rotor = part(geo('drone:rotor', () => new THREE.CylinderGeometry(0.07, 0.07, 0.006, 14)), ROTOR, { cast: false });
    rotor.position.set(s * 0.18, 0.045, 0);
    drone.add(rotor);
    return rotor;
  });
  return { drone, rotors };
}

// ---------------------------------------------------------------------------
// The avatar
// ---------------------------------------------------------------------------

// Returns a THREE.Group named 'root'. Named parts (also in userData.parts):
// root, body, torso, head, faceplate, leftArm, rightArm, leftLeg, rightLeg, drone.
// userData.tick(t) plays the idle from sim time; other modules may override
// part transforms after calling it. Remove with disposeAvatar().
export function createStartNgAvatar(player) {
  const style = normaliseStyle(player?.style);
  const female = style.body === 'female';
  const bodyKey = female ? 'female' : 'male';
  const dims = BODY[bodyKey];
  const mats = makeMaterials(style, faceTextureFor(style, player?.face || null));

  const root = new THREE.Group();
  root.name = 'root';
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  // Hips and legs
  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  body.add(hips);
  const leftLeg = buildLeg(-1, mats, female);
  const rightLeg = buildLeg(1, mats, female);
  hips.add(leftLeg, rightLeg);
  if (female) {
    hips.add(part(geo('skirt', () => place(new THREE.CylinderGeometry(0.2, 0.3, 0.36, 18), { y: -0.14, sz: 0.8 })), mats.secondary));
  } else {
    hips.add(part(geo('tunic:hem', () => place(new THREE.CylinderGeometry(0.215, 0.25, 0.14, 18), { y: -0.04, sz: 0.75 })), mats.primary));
  }

  // Torso: the shell breathes; the chest group carries arms, neck and head.
  const torso = new THREE.Group();
  torso.name = 'torso';
  hips.add(torso);
  const torsoMesh = part(geo(`torso:${bodyKey}`, () =>
    place(new THREE.LatheGeometry(dims.torso.map(([r, y]) => new THREE.Vector2(r, y)), 18), { sz: 0.72 }),
  ), mats.primary);
  torso.add(torsoMesh);
  torso.add(part(geo(`belt:${bodyKey}`, () => female
    ? place(new THREE.CylinderGeometry(0.172, 0.172, 0.045, 18), { y: 0.14, sz: 0.73 })
    : place(new THREE.CylinderGeometry(0.218, 0.218, 0.05, 18), { y: 0.05, sz: 0.73 }),
  ), mats.secondary));

  const chest = new THREE.Group();
  torso.add(chest);
  chest.add(part(geo('collar', () => place(new THREE.TorusGeometry(0.085, 0.025, 6, 16), { y: 0.51, rx: Math.PI / 2 })), mats.secondary));
  chest.add(part(geo('neck', () => place(new THREE.CylinderGeometry(0.06, 0.065, 0.1, 10), { y: 0.55 })), mats.skin));
  chest.add(part(geo(`shoulders:${bodyKey}`, () => {
    const l = place(new THREE.SphereGeometry(dims.shoulderR, 12, 8), { x: -dims.shoulderX, y: dims.shoulderY });
    const r = place(new THREE.SphereGeometry(dims.shoulderR, 12, 8), { x: dims.shoulderX, y: dims.shoulderY });
    return mergeGeometries([l, r]);
  }), mats.primary));
  const leftArm = buildArm(-1, dims, mats, bodyKey);
  const rightArm = buildArm(1, dims, mats, bodyKey);
  chest.add(leftArm, rightArm);

  const { head, faceplate } = buildHead(style, mats);
  chest.add(head);

  const accessory = buildAccessory(style.accessory, mats);
  if (accessory.head) head.add(accessory.head);
  if (accessory.body) chest.add(accessory.body);

  // Hover-drone companion (primary shell, secondary ring)
  const { drone, rotors } = buildDrone(mats);
  root.add(drone);

  const parts = { root, body, torso, head, faceplate, leftArm, rightArm, leftLeg, rightLeg, drone };
  const phase = ((hashString(`${player?.name || 'Guest'}:${style.primaryColor}:${style.hair}`) % 1000) / 1000) * Math.PI * 2;

  // Idle: breathing, slight sway, a curious head, and the drone hovering.
  function tick(t) {
    const tt = t + phase;
    const breath = Math.sin(tt * 2.1);
    torsoMesh.scale.set(1 + 0.006 * breath, 1 + 0.014 * breath, 1 + 0.006 * breath);
    chest.position.y = 0.006 * breath;
    body.rotation.z = Math.sin(tt * 0.9) * 0.012;
    head.rotation.set(Math.sin(tt * 0.9) * 0.02, Math.sin(tt * 0.45) * 0.09, Math.sin(tt * 0.7) * 0.04);
    leftArm.rotation.set(Math.sin(tt * 1.1) * 0.06, 0, -0.12 - 0.015 * breath);
    rightArm.rotation.set(-Math.sin(tt * 1.1) * 0.06, 0, 0.12 + 0.015 * breath);

    drone.position.set(
      DRONE_HOME.x + Math.sin(tt * 0.6) * 0.04,
      DRONE_HOME.y + Math.sin(tt * 2.4) * 0.05,
      DRONE_HOME.z + Math.cos(tt * 0.6) * 0.03,
    );
    drone.rotation.set(0, Math.sin(tt * 0.8) * 0.35, Math.sin(tt * 2.4 + 1) * 0.06);
    rotors[0].rotation.y = tt * 28;
    rotors[1].rotation.y = -tt * 28;
  }

  root.userData = { parts, tick, style, colors: { primary: style.primaryColor, secondary: style.secondaryColor } };
  tick(0);
  return root;
}

export function disposeAvatar(avatar) {
  if (avatar) disposeObject(avatar);
}

// Pedestal ring and trajectory arcs use the player's secondary colour.
export function ringColor(player) {
  return normaliseStyle(player?.style).secondaryColor;
}

export function arcColor(player) {
  return normaliseStyle(player?.style).secondaryColor;
}

// ---------------------------------------------------------------------------
// Guess flag: primary-colour banner with the face emblem and a secondary hem
// ---------------------------------------------------------------------------

const BANNER_W = 0.62;
const BANNER_H = 0.4;

function flagWave(x, t) {
  const k = x / BANNER_W;
  return (Math.sin(x * 9 - t * 5) * 0.045 + Math.sin(x * 15 - t * 7.3) * 0.01) * k;
}

// Returns a THREE.Group named 'flag' (base at y = 0). userData.tick(t) waves it;
// remove with disposeObject() from geom.js.
export function makeFlag(player, { height = 1.1 } = {}) {
  const style = normaliseStyle(player?.style);
  const faceTex = faceTextureFor(style, player?.face || null);
  const flag = new THREE.Group();
  flag.name = 'flag';

  flag.add(part(geo(`flag:pole:${height}`, () => place(new THREE.CylinderGeometry(0.022, 0.028, height, 8), { y: height / 2 })), WOOD));
  flag.add(part(geo(`flag:finial:${height}`, () => place(new THREE.SphereGeometry(0.045, 10, 8), { y: height + 0.03 })), FIXED.gold));

  const bannerMat = new THREE.MeshStandardMaterial({ color: style.primaryColor, roughness: 0.75, side: THREE.DoubleSide });
  const hemMat = new THREE.MeshStandardMaterial({ color: style.secondaryColor, roughness: 0.75, side: THREE.DoubleSide });
  const bannerGeo = new THREE.PlaneGeometry(BANNER_W, BANNER_H, 12, 4).translate(BANNER_W / 2, 0, 0);
  const hemGeo = new THREE.PlaneGeometry(BANNER_W, 0.06, 12, 1).translate(BANNER_W / 2, -BANNER_H / 2 - 0.03, 0);
  const banner = part(bannerGeo, bannerMat);
  const hem = part(hemGeo, hemMat);
  const bannerY = height - BANNER_H / 2 - 0.04;
  banner.position.y = bannerY;
  hem.position.y = bannerY;
  flag.add(banner, hem);

  const emblemMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.6 });
  const emblemGeo = geo('flag:emblem', () => new THREE.CircleGeometry(0.12, 24));
  const front = part(emblemGeo, emblemMat, { cast: false });
  const back = part(emblemGeo, emblemMat, { cast: false });
  back.rotation.y = Math.PI;
  flag.add(front, back);

  const waved = [bannerGeo, hemGeo].map((g) => ({ g, base: g.attributes.position.array.slice() }));

  function tick(t) {
    for (const { g, base } of waved) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, base[i * 3 + 2] + flagWave(base[i * 3], t));
      pos.needsUpdate = true;
      g.computeVertexNormals();
    }
    const ex = BANNER_W / 2;
    const ez = flagWave(ex, t);
    front.position.set(ex, bannerY, ez + 0.006);
    back.position.set(ex, bannerY, ez - 0.006);
  }

  flag.userData = { tick, banner };
  tick(0);
  return flag;
}
