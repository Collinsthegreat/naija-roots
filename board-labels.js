// Region-name labels for a board: canvas-texture sprites, one shared atlas per
// board (one GPU upload; each sprite's texture is a clone that only changes the
// UV window). Labels keep a constant on-screen size, so zooming in spreads the
// tiles apart and makes room for more of them.
//
// A label is eligible when its tile is hovered or focused, or when the tile is
// big enough on screen ("zoomed close enough"). Eligible labels are then placed
// greedily in screen space and any that would overlap an already placed label,
// a HUD panel or the screen edge are rejected, so labels never overlap.
// Everything here runs inside the sim step; opacity fades are damped there.

import * as THREE from 'three';
import { damp } from './geom.js';

const PILL_H = 24; // CSS px
const FONT_PX = 13; // CSS px
const PAD_X = 10; // CSS px
const DOT = 7; // CSS px, the zone / region colour swatch
const DOT_GAP = 6;
const ATLAS_SCALE = 2; // atlas pixels per CSS px, so labels stay crisp on HiDPI
const ATLAS_W = 1024;
const GUTTER = 4; // atlas px between labels, so linear filtering never bleeds
const LABEL_LIFT = 0.1; // world units above the tile top
const SCREEN_MARGIN = 4; // CSS px kept clear at the screen edges
const MIN_TILE_PX = 56; // tile circumradius on screen before its label may show
const MAX_SHOWN = 16; // more names than this read as clutter (and cost draw calls)
const FADE_LAMBDA = 12; // fade in
const FADE_OUT_LAMBDA = 30; // fade out faster, so no half-faded "ghost" names linger
const FADE_OUT_CUT = 0.2; // a fading label below this opacity disappears
const FONT = `600 ${FONT_PX * ATLAS_SCALE}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

// Draws every label into one atlas canvas. Returns the canvas and each label's
// rectangle in atlas pixels.
function drawAtlas(items) {
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = FONT;
  const h = PILL_H * ATLAS_SCALE;
  const rects = [];
  let x = GUTTER;
  let y = GUTTER;
  for (const item of items) {
    const textW = Math.ceil(measure.measureText(item.name).width);
    const w = Math.min(ATLAS_W - 2 * GUTTER, textW + (2 * PAD_X + DOT + DOT_GAP) * ATLAS_SCALE);
    if (x + w + GUTTER > ATLAS_W) {
      x = GUTTER;
      y += h + GUTTER;
    }
    rects.push({ x, y, w, h });
    x += w + GUTTER;
  }
  const height = Math.ceil((y + h + GUTTER) / 4) * 4;

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  items.forEach((item, i) => {
    const r = rects[i];
    const rad = r.h / 2;
    ctx.fillStyle = 'rgba(255, 250, 241, 0.94)';
    ctx.strokeStyle = 'rgba(185, 150, 105, 0.55)';
    ctx.lineWidth = ATLAS_SCALE;
    ctx.beginPath();
    ctx.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad);
    ctx.fill();
    ctx.stroke();
    const dotX = r.x + PAD_X * ATLAS_SCALE + (DOT * ATLAS_SCALE) / 2;
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(dotX, r.y + r.h / 2, (DOT * ATLAS_SCALE) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2118';
    ctx.fillText(item.name, r.x + (PAD_X + DOT + DOT_GAP) * ATLAS_SCALE, r.y + r.h / 2 + ATLAS_SCALE);
  });
  return { canvas, rects };
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Screen rectangle (CSS px) of a world-space capsule { a, b, radius }: the
// box around both projected ends, grown by the radius at the nearer end.
// Null when the capsule is behind the camera.
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
// Screen rectangle (CSS px) of a box obstacle { at, wPx, hPx }: a sprite of
// that on-screen size anchored bottom-centre at world point `at` (km labels).
// Null when it is behind the camera.
function boxRect(o, camera, width, height) {
  if (-_pa.copy(o.at).applyMatrix4(camera.matrixWorldInverse).z <= camera.near) return null;
  _pa.copy(o.at).project(camera);
  const x = (_pa.x + 1) * 0.5 * width;
  const y = (1 - _pa.y) * 0.5 * height;
  return { left: x - o.wPx / 2, right: x + o.wPx / 2, top: y - o.hPx, bottom: y };
}

function capsuleRect(o, camera, width, height, p11) {
  const depthA = -_pa.copy(o.a).applyMatrix4(camera.matrixWorldInverse).z;
  const depthB = -_pb.copy(o.b).applyMatrix4(camera.matrixWorldInverse).z;
  const depth = Math.min(depthA, depthB);
  if (depth <= camera.near) return null;
  _pa.copy(o.a).project(camera);
  _pb.copy(o.b).project(camera);
  const r = (o.radius * p11 * height) / 2 / depth;
  const xa = (_pa.x + 1) * 0.5 * width;
  const xb = (_pb.x + 1) * 0.5 * width;
  const ya = (1 - _pa.y) * 0.5 * height;
  const yb = (1 - _pb.y) * 0.5 * height;
  return { left: Math.min(xa, xb) - r, right: Math.max(xa, xb) + r, top: Math.min(ya, yb) - r, bottom: Math.max(ya, yb) + r };
}

// items: [{ name, color }] in tile order. parent: the board root (sprites are
// positioned in its space).
export function createLabelLayer(items, parent) {
  const { canvas, rects } = drawAtlas(items);
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.minFilter = THREE.LinearFilter;
  atlas.generateMipmaps = false;

  const group = new THREE.Group();
  group.name = 'labels';
  parent.add(group);

  const labels = items.map((item, i) => {
    const r = rects[i];
    const map = atlas.clone(); // shares the atlas image: one upload
    map.offset.set(r.x / canvas.width, 1 - (r.y + r.h) / canvas.height);
    map.repeat.set(r.w / canvas.width, r.h / canvas.height);
    const material = new THREE.SpriteMaterial({
      map,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      toneMapped: false,
      fog: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.center.set(0.5, 0); // anchored at the bottom centre, above the tile
    sprite.renderOrder = 20;
    sprite.visible = false;
    group.add(sprite);
    return {
      sprite,
      material,
      map,
      wPx: r.w / ATLAS_SCALE,
      hPx: r.h / ATLAS_SCALE,
      shown: false,
      opacity: 0,
      rect: { left: 0, top: 0, right: 0, bottom: 0 },
      onScreen: false,
      score: 0,
      tilePx: 0,
    };
  });

  const world = new THREE.Vector3();
  const view = new THREE.Vector3();

  // ctx: { camera, width, height, blockers: [{left, top, right, bottom}],
  //        obstacles: things labels must not cover: [{ a, b, radius }] world
  //        capsules (the explorer, the bearing arrows) or [{ at, wPx, hPx }]
  //        screen-sized boxes anchored bottom-centre at a world point (km labels),
  //        anchors: (i, out) => out (tile top centre, board-root space),
  //        cellSize, hovered, focused, enabled }
  function update(dt, ctx) {
    const { camera, width, height } = ctx;
    const p11 = camera.projectionMatrix.elements[5];
    const pxPerNdc = height / 2;
    parent.updateWorldMatrix(true, false);

    // Screen rectangle and tile size for every label.
    labels.forEach((label, i) => {
      ctx.anchors(i, label.sprite.position);
      label.sprite.position.y += LABEL_LIFT;
      label.sprite.scale.set((label.wPx * 2) / (p11 * height), (label.hPx * 2) / (p11 * height), 1);

      world.copy(label.sprite.position).applyMatrix4(parent.matrixWorld);
      view.copy(world).applyMatrix4(camera.matrixWorldInverse);
      const depth = -view.z;
      world.project(camera);
      const sx = (world.x + 1) * 0.5 * width;
      const sy = (1 - world.y) * 0.5 * height;
      const r = label.rect;
      r.left = sx - label.wPx / 2;
      r.right = sx + label.wPx / 2;
      r.top = sy - label.hPx;
      r.bottom = sy;
      label.onScreen = depth > camera.near && world.z < 1
        && r.left >= SCREEN_MARGIN && r.top >= SCREEN_MARGIN
        && r.right <= width - SCREEN_MARGIN && r.bottom <= height - SCREEN_MARGIN;
      label.tilePx = depth > 0 ? (ctx.cellSize * p11 * pxPerNdc) / depth : 0;
      label.score = Math.hypot(sx - width / 2, sy - height / 2);
    });

    const eligible = (i) => ctx.enabled
      && (i === ctx.hovered || i === ctx.focused || labels[i].tilePx >= MIN_TILE_PX);

    // Placement order: hovered, focused, labels already showing (so they don't
    // flicker), labels still fading out (they only block), then newcomers
    // nearest the screen centre first. Ties go by tile order.
    const byScore = (a, b) => labels[a].score - labels[b].score || a - b;
    const all = labels.map((_, i) => i);
    const first = [ctx.hovered, ctx.focused].filter((i, k, arr) => i >= 0 && arr.indexOf(i) === k);
    const rest = all.filter((i) => !first.includes(i));
    const keepers = rest.filter((i) => labels[i].shown && eligible(i)).sort(byScore);
    const fading = rest.filter((i) => !eligible(i) && labels[i].opacity > 0.01);
    const newcomers = rest.filter((i) => !labels[i].shown && eligible(i)).sort(byScore);

    const taken = ctx.blockers.slice();
    for (const o of ctx.obstacles ?? []) {
      const rect = o.at ? boxRect(o, camera, width, height) : capsuleRect(o, camera, width, height, p11);
      if (rect) taken.push(rect);
    }
    const free = (r) => !taken.some((b) => overlaps(r, b));
    for (const i of [...first, ...keepers]) {
      const label = labels[i];
      label.shown = eligible(i) && label.onScreen && free(label.rect);
      if (label.shown) taken.push(label.rect);
      else label.opacity = 0; // it would overlap something: hide at once
    }
    for (const i of fading) {
      const label = labels[i];
      label.shown = false;
      if (label.onScreen && free(label.rect)) taken.push(label.rect);
      else label.opacity = 0;
    }
    let count = labels.filter((l) => l.shown).length;
    for (const i of newcomers) {
      const label = labels[i];
      label.shown = count < MAX_SHOWN && label.onScreen && free(label.rect);
      if (label.shown) {
        taken.push(label.rect);
        count += 1;
      }
    }

    for (const label of labels) {
      label.opacity = damp(label.opacity, label.shown ? 1 : 0, label.shown ? FADE_LAMBDA : FADE_OUT_LAMBDA, dt);
      if (!label.shown && label.opacity < FADE_OUT_CUT) label.opacity = 0;
      label.material.opacity = label.opacity;
      label.sprite.visible = label.opacity > 0;
    }
  }

  function hideAll() {
    for (const label of labels) {
      label.shown = false;
      label.opacity = 0;
      label.material.opacity = 0;
      label.sprite.visible = false;
    }
  }

  function dispose() {
    for (const label of labels) {
      label.map.dispose();
      label.material.dispose();
    }
    atlas.dispose();
    group.removeFromParent();
  }

  return { group, update, hideAll, dispose, isShown: (i) => labels[i].shown };
}
