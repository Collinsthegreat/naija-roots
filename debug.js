// Debug views (only active with ?avatars or ?npc in the URL).
//   ?avatars → a 4×3 grid of explorers covering every style option, with labels
//   ?npc     → camera on the storyteller; keys 1–8 set the reveal stage,
//              C cycles sample cultures, G plays the celebration

import * as THREE from 'three';
import { createStartNgAvatar, disposeAvatar } from './avatar.js';
import { normalisePlayer } from './startng.js';
import { createLabelTexture } from './textures.js';
import { SAMPLE_CULTURES } from './npc.js';
import { LAYOUT } from './scene.js';
import { disposeObject } from './geom.js';

export function debugModeFrom(params) {
  if (params.has('avatars')) return 'avatars';
  if (params.has('npc')) return 'npc';
  return null;
}

// Camera framing for each debug view (passed to createCameraRig).
export function cameraOptionsFor(mode) {
  if (mode === 'avatars') {
    return { target: [0, LAYOUT.islandTop + 0.85, 0.2], distance: 10.5, pitch: THREE.MathUtils.degToRad(28), fitWidth: 7.5, limits: { distance: [5, 30] } };
  }
  if (mode === 'npc') {
    return {
      target: [LAYOUT.pedestalX, LAYOUT.pedestalTop + 1.0, LAYOUT.pedestalZ],
      distance: 6.2, yaw: -0.5, pitch: THREE.MathUtils.degToRad(12), fitWidth: 3.6,
      limits: { distance: [3, 30], pitch: [THREE.MathUtils.degToRad(2), THREE.MathUtils.degToRad(62)] },
    };
  }
  return {};
}

// A small drawn face PNG standing in for a start.ng face picture.
function syntheticFace(bg, skin, eye) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(64, 68, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = eye;
  for (const x of [46, 82]) {
    ctx.beginPath();
    ctx.arc(x, 62, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#3a1a10';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 80, 16, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  return c.toDataURL('image/png');
}

// Every documented value appears at least once, plus the brief's extras
// (fila, headwrap, shades, beads), the aliases (locks, hat) and unknown values.
const GRID = [
  { body: 'female', hair: 'braids', hat: 'crown', accessory: 'earrings', p: '#a55eea', s: '#0c6e5a', skin: '#8d5524', hc: '#17120f', face: ['#d8fd71', '#8d5524', '#1b1410'] },
  { body: 'male', hair: 'afro', hat: 'none', accessory: 'glasses', p: '#4b7bec', s: '#2b2f4a', skin: '#6b3e1f', hc: '#1b1410' },
  { body: 'female', hair: 'bun', hat: 'headwrap', accessory: 'beads', p: '#e07a2f', s: '#3d6b3a', skin: '#a0663c', hc: '#2a1a12' },
  { body: 'male', hair: 'short', hat: 'cap', accessory: 'backpack', p: '#2f9e6b', s: '#c8643b', skin: '#c68e5a', hc: '#3a2416' },
  { body: 'female', hair: 'ponytail', hat: 'beanie', accessory: 'scarf', p: '#e84a5f', s: '#2a3a5c', skin: '#5a3418', hc: '#0f0b08', face: ['#a9d3e0', '#5a3418', '#0f0b08'] },
  { body: 'male', hair: 'dreads', hat: 'fila', accessory: 'shades', p: '#f0c419', s: '#5b3a8c', skin: '#4a2a14', hc: '#20140c' },
  { body: 'male', hair: 'bald', hat: 'tophat', accessory: 'beard', p: '#7a2e3b', s: '#d9b98a', skin: '#8d5524', hc: '#2b1d14' },
  { body: 'female', hair: 'afro', hat: 'cap', accessory: 'glasses', p: '#1fa2a8', s: '#f3e6cf', skin: '#7a4a28', hc: '#5a2d16' },
  { body: 'male', hair: 'braids', hat: 'beanie', accessory: 'earrings', p: '#3d4a5c', s: '#e2b33c', skin: '#9c6b43', hc: '#111111' },
  { body: 'female', hair: 'locks', hat: 'hat', accessory: 'backpack', p: '#c8343b', s: '#1f5fa8', skin: '#6b4226', hc: '#2a160c' },
  { body: 'male', hair: 'mohawk', hat: 'sombrero', accessory: 'monocle', p: '#8fb860', s: '#7f3a20', skin: '#b07848', hc: '#40281a', face: ['#f3e6cf', '#b07848', '#24170f'] },
  { body: 'female', hair: 'dreads', hat: 'headwrap', accessory: 'shades', p: '#f2efe7', s: '#2f6db5', skin: '#3e2412', hc: '#14100c' },
];

function createAvatarGrid(anchor, hud) {
  const group = new THREE.Group();
  group.name = 'debugAvatars';
  anchor.add(group);
  const avatars = [];
  const owned = [];
  const list = document.createElement('ol');
  list.style.cssText = 'margin:0;padding-left:1.4em;font-size:13px;line-height:1.5;';

  GRID.forEach((g, i) => {
    const raw = {
      name: `Explorer ${i + 1}`,
      style: { body: g.body, hair: g.hair, hat: g.hat, accessory: g.accessory, primaryColor: g.p, secondaryColor: g.s, skinColor: g.skin, hairColor: g.hc },
      face: g.face ? syntheticFace(...g.face) : null,
    };
    const player = normalisePlayer(raw, 'user');
    const avatar = createStartNgAvatar(player);
    const col = i % 4;
    const row = Math.floor(i / 4);
    avatar.position.set((col - 1.5) * 1.45, 0, (row - 1) * 1.55);
    group.add(avatar);
    avatars.push(avatar);

    const tex = createLabelTexture(String(i + 1));
    const labelGeo = new THREE.PlaneGeometry(0.42, 0.16);
    const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(avatar.position.x, 0.02, avatar.position.z + 0.45);
    label.rotation.x = -Math.PI / 2 + 0.5;
    group.add(label);
    owned.push(tex, labelGeo, labelMat);

    const st = player.style;
    const li = document.createElement('li');
    const note = g.hair !== st.hair || g.hat !== st.hat || g.accessory !== st.accessory ? ` (sent ${g.hair}/${g.hat}/${g.accessory})` : '';
    li.textContent = `${st.body} · ${st.hair} · ${st.hat} · ${st.accessory}${player.face ? ' · face PNG' : ''}${note}`;
    list.append(li);
  });

  const title = document.createElement('b');
  title.textContent = 'Avatar check: body · hair · hat · accessory';
  hud.replaceChildren(title, list);

  return {
    update(dt, t) {
      for (const a of avatars) a.userData.tick(t);
    },
    reset() {},
    dispose() {
      avatars.forEach(disposeAvatar);
      for (const r of owned) r.dispose();
      disposeObject(group);
      hud.replaceChildren();
    },
  };
}

const STAGE_NAMES = ['Silhouette', 'Attire colour', 'Trim pattern', 'Headgear shape', 'Headgear colour', 'Prop', 'Beads', 'Full colour'];

function createNpcStepper(storyteller, hud, enableKeys) {
  let index = 0;
  const info = document.createElement('div');
  info.style.cssText = 'font-size:13px;line-height:1.5;';

  function render() {
    const c = storyteller.culture;
    const lines = [
      `Stage ${storyteller.stage}: ${STAGE_NAMES[storyteller.stage - 1]}`,
      `Sample ${index + 1}/${SAMPLE_CULTURES.length}: ${c.headgear} · ${c.prop} · ${c.pose} · ${c.pattern}`,
      'Keys: 1–8 stage · C next culture · G celebrate',
    ];
    info.replaceChildren(...lines.map((text, i) => {
      const el = document.createElement(i === 0 ? 'b' : 'div');
      el.textContent = text;
      return el;
    }));
  }

  function onKey(e) {
    if (e.key >= '1' && e.key <= '8') storyteller.setRevealStage(Number(e.key));
    else if (e.key === 'c' || e.key === 'C') {
      index = (index + 1) % SAMPLE_CULTURES.length;
      const stage = storyteller.stage;
      storyteller.setTarget(SAMPLE_CULTURES[index]);
      storyteller.setRevealStage(stage);
    } else if (e.key === 'g' || e.key === 'G') storyteller.celebrate();
    else return;
    render();
  }

  if (enableKeys) window.addEventListener('keydown', onKey);
  hud.replaceChildren(info);
  render();

  return {
    update() {},
    reset() {},
    dispose() {
      window.removeEventListener('keydown', onKey);
      hud.replaceChildren();
    },
  };
}

// Creates the requested debug view. ctx = { anchor, storyteller, hud, capture }.
export function createDebugView(mode, ctx) {
  if (mode === 'avatars') return createAvatarGrid(ctx.anchor, ctx.hud);
  if (mode === 'npc') return createNpcStepper(ctx.storyteller, ctx.hud, !ctx.capture);
  return null;
}
