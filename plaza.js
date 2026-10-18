// The Heritage Plaza: every origin solved (Daily or Endless) awards an artifact
// for that culture (plaza-parts.js), shown as a small monument on a stone
// plinth around the island's rim. Slots fill in a fixed order, starting at the
// back of the island and alternating left and right toward the front, so the
// collection grows behind the board where it never hides a tile.
//
// Rendering: one InstancedMesh for the plinths, and two per artifact kind (the
// natural-coloured base and the culture-tinted accent). Hover (mouse) or tap
// (touch) shows a small label. tour() flies the camera slowly past the
// collection. Everything animates inside update(dt, t), the fixed sim step.
//
// Storage: localStorage key 'roots3d:plaza:v1' through storage.js (try/catch,
// in-memory fallback), so the game works when storage is unavailable.

import * as THREE from 'three';
import { readJSON, writeJSON } from './storage.js';
import { clamp, smoothstep } from './geom.js';
import { TRIBE_BY_ID } from './data/tribes.js';
import { COUNTRY_BY_ID } from './data/africa.js';
import { ARTIFACT_KINDS, ARTIFACT_NAMES, artifactKindFor, createArtifactGeometries, plinthGeometry } from './plaza-parts.js';

const STORAGE_KEY = 'plaza:v1';
export const SLOT_COUNT = 60;
const SLOT_RADIUS = 5.34; // on the grass edge, just outside the boards (≤ 4.95)
const SLOT_Y = -0.02; // the rim surface at that radius
const PLINTH_TOP = 0.1;
const MONUMENT_SCALE = 1.15;
const RISE_TIME = 0.9;
const LOOKUP = { naija: TRIBE_BY_ID, africa: COUNTRY_BY_ID };

const TOUR = { travel: 2.6, hold: 1.8, distance: 7.2, pitch: THREE.MathUtils.degToRad(30), maxStops: 8 };
const TAP_SLOP = 10;
const LABEL_H = 26; // CSS px

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const easeOutBack = (x) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;

// Slot k: 0 at the back (−z), then alternating right/left toward the front.
export function slotPosition(k, out = new THREE.Vector3()) {
  const step = (Math.PI * 2) / SLOT_COUNT;
  const n = Math.ceil(k / 2);
  const phi = (k % 2 === 1 ? 1 : -1) * n * step;
  return out.set(Math.sin(phi) * SLOT_RADIUS, SLOT_Y, -Math.cos(phi) * SLOT_RADIUS);
}

function loadItems() {
  const raw = readJSON(STORAGE_KEY);
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const origin = LOOKUP[it?.mode]?.[it?.id];
    const key = `${it?.mode}:${it?.id}`;
    if (!origin || seen.has(key)) continue; // unknown or repeated: skip quietly
    seen.add(key);
    out.push({ mode: it.mode, id: it.id });
  }
  return out;
}

function makeLabelCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 64;
  return canvas;
}

// Draws "Kind · Origin" centred; returns the drawn width in canvas px.
function drawLabel(canvas, text, color) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '600 28px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const textW = Math.min(canvas.width - 80, Math.ceil(ctx.measureText(text).width));
  const w = textW + 72;
  const x = (canvas.width - w) / 2;
  ctx.fillStyle = 'rgba(255, 250, 241, 0.95)';
  ctx.strokeStyle = 'rgba(185, 150, 105, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x + 1, 3, w - 2, 58, 29);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 30, 32, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2118';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 48, 34, textW);
  return w;
}

// ctx: { islandAnchor, camera, rig }
export function createPlaza({ islandAnchor, camera, rig }) {
  const root = new THREE.Group();
  root.name = 'plaza';
  islandAnchor.add(root);

  const geos = createArtifactGeometries();
  const plinthGeo = plinthGeometry();
  const hitGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.75, 8).translate(0, 0.37, 0);
  const baseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15, flatShading: true });
  const accentMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true });
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const hitMat = new THREE.MeshBasicMaterial();

  const sphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), SLOT_RADIUS + 1);
  function instanced(geo, mat, name, shadows = true) {
    const mesh = new THREE.InstancedMesh(geo, mat, SLOT_COUNT);
    mesh.name = name;
    mesh.count = 0;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.boundingSphere = sphere.clone();
    root.add(mesh);
    return mesh;
  }
  const plinths = instanced(plinthGeo, stoneMat, 'plaza-plinths');
  const hits = instanced(hitGeo, hitMat, 'plaza-hit', false);
  hits.visible = false; // never drawn; the raycaster still tests it
  const kinds = {};
  for (const kind of ARTIFACT_KINDS) {
    const accent = instanced(geos[kind].accent, accentMat, `plaza-${kind}-accent`);
    // Colours exist from the start, so the shader never has to change later.
    for (let i = 0; i < SLOT_COUNT; i++) accent.setColorAt(i, _c.set('#ffffff'));
    kinds[kind] = { base: instanced(geos[kind].base, baseMat, `plaza-${kind}`), accent };
  }

  // Hover label: one sprite, redrawn when the hovered monument changes.
  const labelCanvas = makeLabelCanvas();
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  labelTex.minFilter = THREE.LinearFilter;
  labelTex.generateMipmaps = false;
  const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false, fog: false });
  const label = new THREE.Sprite(labelMat);
  label.name = 'plaza-label';
  label.center.set(0.5, 0);
  label.renderOrder = 25;
  label.visible = false;
  root.add(label);

  let entries = []; // { mode, id, kind, name, color, slot, age }
  let dirty = true;
  let hovered = -1;
  let sticky = -1;
  let labelFor = -1;
  let labelOpacity = 0;
  let pointer = null;
  let taps = [];
  let touring = null;
  let onTourEnd = null;
  let viewportH = 1;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitList = [];

  function entryFor(item, slot, age) {
    const origin = LOOKUP[item.mode][item.id];
    const kind = artifactKindFor(item.mode, origin);
    return { mode: item.mode, id: item.id, kind, name: origin.name, color: new THREE.Color(origin.npc.attire[0]), slot, age };
  }

  function load() {
    entries = loadItems().map((it, i) => entryFor(it, i, RISE_TIME));
    dirty = true;
  }

  function save() {
    writeJSON(STORAGE_KEY, { items: entries.map((e) => ({ mode: e.mode, id: e.id })) });
  }

  // --- API ------------------------------------------------------------------

  function has(mode, id) {
    return entries.some((e) => e.mode === mode && e.id === id);
  }

  // Awards the artifact for a solved origin. Returns { kind, name, isNew, slot }
  // (isNew false when it was already in the plaza), or null for unknown ids.
  function award(mode, id) {
    if (!LOOKUP[mode]?.[id]) return null;
    const existing = entries.find((e) => e.mode === mode && e.id === id);
    if (existing) return { kind: existing.kind, name: ARTIFACT_NAMES[existing.kind], isNew: false, slot: existing.slot };
    const entry = entryFor({ mode, id }, entries.length, 0);
    entries.push(entry);
    dirty = true;
    save();
    return { kind: entry.kind, name: ARTIFACT_NAMES[entry.kind], isNew: true, slot: entry.slot, shown: entry.slot < SLOT_COUNT };
  }

  // Ids collected in a mode (Endless skips these when it can).
  function collected(mode) {
    return entries.filter((e) => e.mode === mode).map((e) => e.id);
  }

  // World position of a monument's top, or null.
  function monumentWorldPosition(index, out = new THREE.Vector3()) {
    const e = entries[index];
    if (!e || e.slot >= SLOT_COUNT) return null;
    slotPosition(e.slot, out);
    out.y += PLINTH_TOP + 0.42 * MONUMENT_SCALE;
    islandAnchor.updateWorldMatrix(true, false);
    return out.applyMatrix4(islandAnchor.matrixWorld);
  }

  // --- camera tour --------------------------------------------------------------

  // Flies the camera slowly past up to 8 monuments (evenly picked), holding at
  // each, then home. onEnd runs when it finishes or is stopped. Returns false
  // when there is nothing to show.
  function tour({ onEnd } = {}) {
    const shown = entries.map((e, i) => i).filter((i) => entries[i].slot < SLOT_COUNT);
    if (!shown.length) return false;
    stopTour(false);
    const n = Math.min(TOUR.maxStops, shown.length);
    const picks = Array.from({ length: n }, (_, k) => shown[Math.floor((k * shown.length) / n)]);
    const stops = picks.map((i) => {
      const target = monumentWorldPosition(i);
      target.y -= 0.2;
      return { index: i, target, yaw: clamp(Math.atan2(target.x, 4), -0.75, 0.75), pitch: TOUR.pitch, distance: TOUR.distance };
    });
    touring = { stops, i: 0, phase: 'travel', t: 0, from: rig.goal };
    onTourEnd = onEnd ?? null;
    return true;
  }

  function stopTour(home = true) {
    if (!touring) return;
    touring = null;
    if (home) rig.goHome();
    const fn = onTourEnd;
    onTourEnd = null;
    fn?.();
  }

  const _goalTarget = new THREE.Vector3();
  function stepTour(dt) {
    const tr = touring;
    tr.t += dt;
    const stop = tr.stops[tr.i];
    if (tr.phase === 'travel') {
      const k = smoothstep(tr.t / TOUR.travel);
      rig.setGoal({
        target: _goalTarget.copy(tr.from.target).lerp(stop.target, k),
        distance: tr.from.distance + (stop.distance - tr.from.distance) * k,
        yaw: tr.from.yaw + (stop.yaw - tr.from.yaw) * k,
        pitch: tr.from.pitch + (stop.pitch - tr.from.pitch) * k,
      });
      if (tr.t >= TOUR.travel) {
        tr.phase = 'hold';
        tr.t = 0;
      }
    } else if (tr.t >= TOUR.hold) {
      tr.i += 1;
      if (tr.i >= tr.stops.length) {
        stopTour(true);
        return;
      }
      tr.phase = 'travel';
      tr.t = 0;
      tr.from = rig.goal;
    }
  }

  // --- input (records only; picking happens in update) -----------------------------

  function attachInput(el) {
    const downs = new Map();
    const toNdc = (x, y) => {
      const r = el.getBoundingClientRect();
      return { x: ((x - r.left) / r.width) * 2 - 1, y: -((y - r.top) / r.height) * 2 + 1 };
    };
    const onDown = (e) => {
      downs.set(e.pointerId, { x: e.clientX, y: e.clientY, travel: 0 });
      if (touring) stopTour(false); // the player takes the camera back
    };
    const onMove = (e) => {
      const d = downs.get(e.pointerId);
      if (d) {
        d.travel += Math.hypot(e.clientX - d.x, e.clientY - d.y);
        d.x = e.clientX;
        d.y = e.clientY;
      }
      if (e.pointerType !== 'touch') pointer = toNdc(e.clientX, e.clientY);
    };
    const onUp = (e) => {
      const d = downs.get(e.pointerId);
      downs.delete(e.pointerId);
      if (d && d.travel <= TAP_SLOP && e.pointerType === 'touch') taps.push(toNdc(e.clientX, e.clientY));
    };
    const onLeave = (e) => {
      if (e.pointerType !== 'touch') pointer = null;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
    };
  }

  function entryAt(p) {
    if (!p || !hits.count) return -1;
    camera.updateMatrixWorld();
    hits.updateWorldMatrix(true, false);
    raycaster.setFromCamera(ndc.set(p.x, p.y), camera);
    hitList.length = 0;
    raycaster.intersectObject(hits, false, hitList);
    return hitList.length ? hitList[0].instanceId : -1;
  }

  // --- sim step -------------------------------------------------------------------------

  function writeMatrices() {
    const counts = Object.fromEntries(ARTIFACT_KINDS.map((k) => [k, 0]));
    let n = 0;
    let animating = false;
    for (const e of entries) {
      if (e.slot >= SLOT_COUNT) continue;
      const rise = clamp(e.age / RISE_TIME, 0, 1);
      if (rise < 1) animating = true;
      slotPosition(e.slot, _p);
      _q.identity();
      const plinthK = smoothstep(rise / 0.4);
      _m.compose(_p, _q, _s.set(plinthK, plinthK, plinthK));
      plinths.setMatrixAt(n, _m);
      hits.setMatrixAt(n, _m);
      const k = MONUMENT_SCALE * easeOutBack(clamp((rise - 0.25) / 0.75, 0, 1));
      _p.y += PLINTH_TOP * plinthK;
      _m.compose(_p, _q, _s.set(k, k, k));
      const pair = kinds[e.kind];
      const j = counts[e.kind]++;
      pair.base.setMatrixAt(j, k > 0 ? _m : ZERO);
      pair.accent.setMatrixAt(j, k > 0 ? _m : ZERO);
      pair.accent.setColorAt(j, _c.copy(e.color));
      n += 1;
    }
    plinths.count = n;
    hits.count = n;
    plinths.instanceMatrix.needsUpdate = true;
    hits.instanceMatrix.needsUpdate = true;
    plinths.visible = n > 0; // empty meshes cost no draw call
    for (const kind of ARTIFACT_KINDS) {
      const pair = kinds[kind];
      pair.base.count = counts[kind];
      pair.accent.count = counts[kind];
      pair.base.visible = counts[kind] > 0;
      pair.accent.visible = counts[kind] > 0;
      pair.base.instanceMatrix.needsUpdate = true;
      pair.accent.instanceMatrix.needsUpdate = true;
      if (pair.accent.instanceColor) pair.accent.instanceColor.needsUpdate = true;
    }
    return animating;
  }

  function update(dt) {
    let animating = false;
    for (const e of entries) {
      if (e.age < RISE_TIME) {
        e.age = Math.min(RISE_TIME, e.age + dt);
        animating = true;
      }
    }
    if (dirty || animating) {
      writeMatrices();
      dirty = false;
    }

    if (touring) stepTour(dt);

    // Hover (mouse) or the last tap (touch); a tour shows its current stop.
    const pointed = entryAt(pointer);
    for (const tp of taps) sticky = entryAt(tp);
    taps = [];
    // Hit instances are in shown-slot order, which is the entries order.
    hovered = touring && touring.phase === 'hold' ? touring.stops[touring.i].index : pointed >= 0 ? pointed : sticky;

    if (hovered >= 0 && hovered !== labelFor) {
      const e = entries[hovered];
      drawLabel(labelCanvas, `${ARTIFACT_NAMES[e.kind]} · ${e.name}`, `#${e.color.getHexString()}`);
      labelTex.needsUpdate = true;
      labelFor = hovered;
    }
    labelOpacity += ((hovered >= 0 ? 1 : 0) - labelOpacity) * (1 - Math.exp(-12 * dt));
    if (hovered < 0 && labelOpacity < 0.01) labelOpacity = 0;
    labelMat.opacity = labelOpacity;
    label.visible = labelOpacity > 0 && labelFor >= 0;
    if (label.visible) {
      slotPosition(entries[labelFor].slot, label.position);
      label.position.y += PLINTH_TOP + 0.55 * MONUMENT_SCALE;
      const p11 = camera.projectionMatrix.elements[5];
      const h = (LABEL_H * 2) / (p11 * viewportH);
      label.scale.set(h * (labelCanvas.width / labelCanvas.height), h, 1);
    }
  }

  function setViewport(w, h) {
    viewportH = Math.max(1, h);
  }

  // Back to the stored collection with nothing animating (capture replays from 0).
  function reset() {
    touring = null;
    onTourEnd = null;
    hovered = -1;
    sticky = -1;
    labelFor = -1;
    labelOpacity = 0;
    pointer = null;
    taps = [];
    // Clear every slot (not only the drawn ones) so a replay starts from
    // identical buffers.
    for (const mesh of [plinths, hits, ...ARTIFACT_KINDS.flatMap((k) => [kinds[k].base, kinds[k].accent])]) {
      for (let i = 0; i < SLOT_COUNT; i++) mesh.setMatrixAt(i, ZERO);
    }
    for (const k of ARTIFACT_KINDS) for (let i = 0; i < SLOT_COUNT; i++) kinds[k].accent.setColorAt(i, _c.set('#ffffff'));
    load();
    writeMatrices();
    dirty = false;
    labelMat.opacity = 0;
    label.visible = false;
  }

  function dispose() {
    stopTour(false);
    for (const kind of ARTIFACT_KINDS) {
      kinds[kind].base.dispose();
      kinds[kind].accent.dispose();
      geos[kind].base.dispose();
      geos[kind].accent.dispose();
    }
    for (const r of [plinths, hits, plinthGeo, hitGeo, baseMat, accentMat, stoneMat, hitMat, labelTex, labelMat]) r.dispose();
    root.removeFromParent();
  }

  reset();

  return {
    has,
    award,
    collected,
    tour,
    stopTour,
    attachInput,
    setViewport,
    update,
    reset,
    dispose,
    get size() {
      return entries.length;
    },
    get shownCount() {
      return Math.min(entries.length, SLOT_COUNT);
    },
    get touring() {
      return touring !== null;
    },
  };
}
