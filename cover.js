// The ?cover view: a composed 1600×1000 store cover (NOTES §1: 16:10, title
// on it). The real scene is staged at fixed sim times: the island with the
// Naija board, the explorer and the half-revealed storyteller on their
// pedestals, flags with tier tints and two trajectory arcs, clouds and water.
// A 2D canvas pass then adds "ROOTS 3D" and the subtitle in the HUD's type.
// Same machine → same pixels: no clock, no randomness beyond the seeded scene.
//
// window.renderCover() returns the PNG data URL; the page shows a preview and
// a "Save cover.png" button (save it next to index.html).

import * as THREE from 'three';
import { STATE_BY_ID } from './data/nigeria.js';
import { haversineKm, bearing8 } from './game.js';
import { SAMPLE_CULTURES } from './npc.js';
import { TIER_COLORS } from './fx.js';

export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 1000;

const SHOT = { target: [0, 2.6, 0.6], distance: 20, pitch: THREE.MathUtils.degToRad(31), yaw: 0.06 };
const SETTLE_AT = 1.4; // seconds: the board has risen; flags go in
const FRAME_AT = 5.0; // seconds: flags planted, arcs grown, nothing mid-motion
const STORY_STAGE = 4; // attire, trim and headgear shape: half revealed
// The guesses on the board: two misses pointing at the answer, then the answer.
const MARKS = [
  { tile: 'kano', tier: 'yellow', toward: 'benue' },
  { tile: 'lagos', tier: 'red', toward: 'benue' },
  { tile: 'benue', tier: 'green' },
];
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

// Title, tier dots and subtitle over a soft wash at the top of the frame.
export function drawCoverTitle(ctx, width = COVER_WIDTH) {
  const cx = width / 2;
  const wash = ctx.createLinearGradient(0, 0, 0, 360);
  wash.addColorStop(0, 'rgba(251, 246, 236, 0.92)');
  wash.addColorStop(0.6, 'rgba(251, 246, 236, 0.55)');
  wash.addColorStop(1, 'rgba(251, 246, 236, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, 360);

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `800 150px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  const a = 'ROOTS';
  const b = ' 3D';
  const wa = ctx.measureText(a).width;
  const wb = ctx.measureText(b).width;
  const x0 = cx - (wa + wb) / 2;
  ctx.shadowColor = 'rgba(74, 46, 22, 0.28)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#2b2118';
  ctx.fillText(a, x0, 178);
  ctx.fillStyle = '#c8643b';
  ctx.fillText(b, x0 + wa, 178);
  ctx.restore();

  // The four feedback colours as a small divider.
  const tiers = ['green', 'cyan', 'yellow', 'red'];
  tiers.forEach((t, i) => {
    ctx.fillStyle = TIER_COLORS[t];
    ctx.beginPath();
    ctx.arc(cx + (i - 1.5) * 28, 214, 7, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `600 46px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillStyle = '#4a3b2e';
  ctx.shadowColor = 'rgba(251, 246, 236, 0.9)';
  ctx.shadowBlur = 10;
  ctx.fillText('Naija Tribes & Africa 54', cx, 276);
  ctx.restore();
}

// ctx: { renderer, scene, camera, world, advanceTo(seconds), restoreView() }
export function createCover({ renderer, scene, camera, world, advanceTo, restoreView }) {
  const { rig, board, fx, storyteller } = world;

  // --- stage the scene (deterministic: fixed sim times) ------------------------
  storyteller.setTarget(SAMPLE_CULTURES[0]); // a neutral sample look, not a real group
  storyteller.setRevealStage(STORY_STAGE);
  storyteller.reset(); // snap to the stage, no fade
  board.setBlockers([{ left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 }]); // no region labels
  board.setViewport(COVER_WIDTH, COVER_HEIGHT);
  fx.setViewport(COVER_WIDTH, COVER_HEIGHT); // km labels sized for the cover, not the window
  rig.setAspect(COVER_WIDTH / COVER_HEIGHT);
  rig.setGoal({ ...SHOT, target: new THREE.Vector3(...SHOT.target) });
  rig.snap();
  advanceTo(SETTLE_AT);
  for (const m of MARKS) {
    fx.plantFlag(m.tile);
    fx.markTile(m.tile, m.tier);
    if (m.toward) {
      const a = STATE_BY_ID[m.tile];
      const b = STATE_BY_ID[m.toward];
      fx.trajectoryArc(m.tile, { bearing: bearing8(a, b), distanceKm: Math.round(haversineKm(a, b)) }, m.tier);
    }
  }
  advanceTo(FRAME_AT);

  // --- render + compose -------------------------------------------------------------
  const out = document.createElement('canvas');
  out.width = COVER_WIDTH;
  out.height = COVER_HEIGHT;
  const ctx2d = out.getContext('2d');

  function renderCover() {
    renderer.setPixelRatio(1);
    renderer.setSize(COVER_WIDTH, COVER_HEIGHT, false);
    camera.aspect = COVER_WIDTH / COVER_HEIGHT;
    camera.updateProjectionMatrix();
    rig.setAspect(camera.aspect);
    renderer.render(scene, camera);
    ctx2d.clearRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
    ctx2d.drawImage(renderer.domElement, 0, 0, COVER_WIDTH, COVER_HEIGHT);
    drawCoverTitle(ctx2d);
    const url = out.toDataURL('image/png');
    restoreView(); // back to the window's size and aspect
    rig.setAspect(COVER_WIDTH / COVER_HEIGHT); // keep the cover framing on screen too
    renderer.render(scene, camera);
    return url;
  }

  return { renderCover };
}

// The preview card with the Save button (in the modal layer, over the scene).
export function showCoverPreview(layer, renderCover) {
  const url = renderCover();
  const img = document.createElement('img');
  img.src = url;
  img.alt = 'ROOTS 3D cover, 1600 by 1000';
  img.style.cssText = 'display:block;width:100%;height:auto;border-radius:12px;box-shadow:0 6px 18px rgba(74,46,22,0.2);';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary-btn';
  save.textContent = 'Save cover.png';
  save.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = renderCover(); // same pixels every time
    a.download = 'cover.png';
    document.body.append(a);
    a.click();
    a.remove();
  });
  const note = document.createElement('p');
  note.className = 'muted small';
  note.textContent = `${COVER_WIDTH} × ${COVER_HEIGHT} PNG. Save it as cover.png next to index.html.`;
  const actions = document.createElement('div');
  actions.className = 'end-actions';
  actions.style.marginTop = '14px';
  actions.append(save);
  const card = document.createElement('section');
  card.setAttribute('aria-label', 'Cover image');
  card.style.width = 'min(1000px, 100%)';
  card.append(img, note, actions);
  layer.replaceChildren(card);
}
