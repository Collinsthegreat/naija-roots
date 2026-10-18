// ROOTS 3D — boot, renderer, fixed-step loop, capture mode and module wiring.
//
// Determinism (CLAUDE.md §3): the world only advances inside simStep(), in fixed
// 1/60 s steps, reading sim time. Wall-clock time is used in exactly two places,
// both outside the sim: the requestAnimationFrame timestamp that feeds the
// accumulator in normal mode, and today's UTC date string for the Daily seed.

import * as THREE from 'three';
import {
  whoami,
  watchPlayer,
  createOfflineGuest,
  disableNetwork,
  consumeSessionHash,
} from './startng.js';
import { createDiorama } from './scene.js';
import { createCameraRig } from './camera.js';
import { createStartNgAvatar, disposeAvatar, ringColor } from './avatar.js';
import { createStoryteller, SAMPLE_CULTURES } from './npc.js';
import { createBoard } from './board.js';
import { createFx } from './fx.js';
import { createPlaza } from './plaza.js';
import { createFlow } from './flow.js';
import { useMemoryStorage } from './storage.js';
import { createCaptureDirector, CAPTURE_CAMERA, CAPTURE_DEMO, CAPTURE_LENGTH } from './capture.js';
import { createCover, showCoverPreview } from './cover.js';
import { whenTexturesReady } from './textures.js';
import { debugModeFrom, cameraOptionsFor, createDebugView } from './debug.js';

const STEP = 1 / 60;
const HUD_PAD = 6; // CSS px kept clear around HUD panels (board labels)
const MAX_FRAME_DELTA = 0.25; // seconds; avoids a spiral of death after a stall
// Frame-rate safety: if frames stay slow, render fewer pixels (2 → 1.5 → 1).
// Rendering resolution only; the sim never sees it. Off in capture and cover.
const SLOW_FRAME = 0.022; // seconds: average frame time that counts as slow
const SLOW_WINDOW = 180; // frames averaged before deciding
const CAPTURE_DATE = '2026-01-01';

const params = new URLSearchParams(window.location.search);
const CAPTURE = params.has('capture');
const COVER = params.has('cover'); // the 1600×1000 store cover (cover.js)
// Capture and cover share the fixed setup: demo date, demo guest, no network,
// memory-only storage, no input, no requestAnimationFrame.
const STATIC = CAPTURE || COVER;
const DEBUG = params.has('debug');
const DEBUG_VIEW = debugModeFrom(params); // ?avatars or ?npc

// Allowed wall-clock read: today's UTC date for the Daily seed (outside the sim).
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// Shared app state. Later steps hang their modules off this.
const app = {
  capture: CAPTURE,
  debug: DEBUG,
  date: STATIC ? CAPTURE_DATE : todayUTC(),
  player: createOfflineGuest(),
  sim: { step: 0, time: 0 },
  renderer: null,
  scene: null,
  camera: null,
  world: null,
  flow: null, // game flow + HUD (flow.js, ui.js); not in the ?avatars / ?npc views
  pixelCap: 2, // max device pixel ratio; lowered by the frame-rate guard
  director: null, // the ?capture showcase script (capture.js)
};

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------

function hideLoading() {
  document.getElementById('loading')?.remove();
}

function showFatal(title, message) {
  hideLoading();
  const layer = document.getElementById('modal-layer');
  const card = document.createElement('div');
  card.className = 'fatal';
  card.setAttribute('role', 'alertdialog');
  const h = document.createElement('h2');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = message;
  card.append(h, p);
  layer.replaceChildren(card);
}

function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: STATIC, // lets capture tooling and the cover read the frame back
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, app.pixelCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

function resize() {
  const { renderer, camera } = app;
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, app.pixelCap));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  app.world?.onResize?.(camera.aspect, w, h);
  measureHud();
}

// Screen rectangles of the visible HUD panels, so board labels are hidden
// behind them and never overlap HUD text. Containers that span the screen (top
// bar, toasts) count by their children; the drawer counts only while open, at
// its resting position; an open modal blocks the whole screen.
const SPANNING = new Set(['top-bar', 'toast-layer']);

function hudRects() {
  const rects = [];
  const add = (r) => {
    if (r.width > 0 && r.height > 0) {
      rects.push({ left: r.left - HUD_PAD, top: r.top - HUD_PAD, right: r.right + HUD_PAD, bottom: r.bottom + HUD_PAD });
    }
  };
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (document.getElementById('modal-layer').childElementCount) {
    add({ left: 0, top: 0, right: w, bottom: h, width: w, height: h });
    return rects;
  }
  for (const el of document.getElementById('hud').children) {
    if (el.hidden) continue;
    if (SPANNING.has(el.id)) {
      for (const child of el.children) add(child.getBoundingClientRect());
    } else if (el.id === 'drawer') {
      if (el.dataset.open === 'true' && el.offsetWidth > 0) add({ left: w - el.offsetWidth, top: 0, right: w, bottom: h, width: el.offsetWidth, height: h });
    } else {
      add(el.getBoundingClientRect());
    }
  }
  return rects;
}

function measureHud() {
  // The left clue column and the toasts sit below the top bar, which can wrap.
  const top = document.getElementById('top-bar');
  document.documentElement.style.setProperty('--top-h', `${Math.ceil(top.offsetHeight) || 56}px`);
  app.world?.board?.setBlockers(hudRects());
}

// Re-measure whenever HUD content, size, the drawer or the modal changes.
function watchHud() {
  const hud = document.getElementById('hud');
  const observer = new MutationObserver(measureHud);
  const what = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-open', 'hidden', 'class'] };
  observer.observe(hud, what);
  observer.observe(document.getElementById('modal-layer'), { childList: true });
  const sizes = new ResizeObserver(measureHud);
  for (const el of hud.children) sizes.observe(el);
}

// ---------------------------------------------------------------------------
// World: diorama + camera rig + board + explorer + storyteller (+ debug view)
// ---------------------------------------------------------------------------

function createWorld(scene, camera) {
  const diorama = createDiorama(scene);
  const rig = createCameraRig(camera, CAPTURE && !DEBUG_VIEW ? CAPTURE_CAMERA : cameraOptionsFor(DEBUG_VIEW));

  // The map boards sit on the island top (not in the ?avatars grid view).
  const board = DEBUG_VIEW === 'avatars'
    ? null
    : createBoard({ anchor: diorama.islandAnchor, camera, rig, mode: 'naija' });

  const storyteller = createStoryteller();
  storyteller.setTarget(SAMPLE_CULTURES[0]);
  storyteller.setRevealStage(1); // title screen: a mystery silhouette
  diorama.pedestals.storyteller.anchor.add(storyteller.root);

  let avatar = null;

  // Flight, flags, arcs, pulses and confetti (needs the board).
  const fx = board
    ? createFx({
      islandAnchor: diorama.islandAnchor,
      playerAnchor: diorama.pedestals.player.anchor,
      storytellerAnchor: diorama.pedestals.storyteller.anchor,
      board,
      rig,
      camera,
      storyteller,
      getAvatar: () => avatar,
      getPlayer: () => app.player,
    })
    : null;

  // Heritage Plaza monuments around the island rim (needs the board).
  const plaza = board ? createPlaza({ islandAnchor: diorama.islandAnchor, camera, rig }) : null;
  // Region labels never cover the explorer or a bearing arrow.
  if (board && fx) board.setObstacles(() => fx.labelObstacles());

  function setAvatar(player) {
    disposeAvatar(avatar);
    avatar = createStartNgAvatar(player);
    diorama.pedestals.player.anchor.add(avatar);
    diorama.pedestals.player.setRingColor(ringColor(player));
    avatar.userData.tick(app.sim.time);
  }

  const debugView = DEBUG_VIEW
    ? createDebugView(DEBUG_VIEW, {
      anchor: diorama.islandAnchor,
      storyteller,
      hud: document.getElementById('clue-panel'),
      capture: CAPTURE,
    })
    : null;

  return {
    diorama,
    rig,
    board,
    fx,
    plaza,
    storyteller,
    setAvatar,
    attachInput(el) {
      rig.attachInput(el);
      board?.attachInput(el);
      plaza?.attachInput(el);
    },
    // Back to the t = 0 state for a capture replay.
    reset() {
      rig.reset();
      fx?.reset();
      board?.reset();
      plaza?.reset();
      storyteller.reset();
      debugView?.reset();
      this.update(0, 0);
    },
    // Runs inside the fixed sim step: dt is always STEP, t is sim time.
    update(dt, t) {
      rig.update(dt);
      diorama.update(dt, t, rig.view);
      board?.update(dt, t);
      avatar?.userData.tick(t);
      fx?.update(dt, t); // after the idle tick: the flight overrides the pose
      plaza?.update(dt);
      storyteller.update(dt);
      debugView?.update(dt, t);
    },
    onResize(aspect, w, h) {
      rig.setAspect(aspect);
      board?.setViewport(w, h);
      fx?.setViewport(w, h);
      plaza?.setViewport(w, h);
    },
  };
}

// ---------------------------------------------------------------------------
// Fixed-step simulation
// ---------------------------------------------------------------------------

function simStep() {
  app.sim.step += 1;
  app.sim.time = app.sim.step * STEP; // derived from the step count: no float drift
  // Capture frames: measure HUD panels every step (observers are async) so the
  // board labels react to a panel in the same frame it appears.
  if (CAPTURE && app.flow) measureHud();
  app.world.update(STEP, app.sim.time);
  app.flow?.update(STEP); // HUD animations are sim-timed too
  app.director?.update(STEP); // the showcase cursor and camera script
}

function resetSim() {
  app.sim.step = 0;
  app.sim.time = 0;
  app.world.reset();
  app.flow?.reset();
  app.director?.reset();
}

function renderFrame() {
  app.renderer.render(app.scene, app.camera);
}

// Capture mode: step from the current sim time up to t (replaying from 0 if t is
// earlier), then render exactly one frame. Returns the sim time reached.
function renderAt(t) {
  const seconds = Number(t);
  const target = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds * 60 + 1e-6) : 0;
  if (target < app.sim.step) resetSim();
  while (app.sim.step < target) simStep();
  renderFrame();
  return app.sim.time;
}

// Normal mode: real frame delta feeds the accumulator; the sim only ever sees STEP.
function startLoop() {
  let last = null;
  let accumulator = 0;
  let slowSum = 0;
  let slowFrames = 0;
  let firstFrame = true;

  // Outside the sim: only the rendering resolution changes.
  function guardFrameRate(delta) {
    if (app.pixelCap <= 1 || delta <= 0) return;
    slowSum += delta;
    slowFrames += 1;
    if (slowFrames < SLOW_WINDOW) return;
    const average = slowSum / slowFrames;
    slowSum = 0;
    slowFrames = 0;
    if (average > SLOW_FRAME && Math.min(window.devicePixelRatio || 1, app.pixelCap) > 1) {
      app.pixelCap = Math.max(1, app.pixelCap - 0.5);
      resize();
      if (DEBUG) console.info('[roots3d] slow frames: pixel ratio capped at', app.pixelCap);
    }
  }

  function frame(timestampMs) {
    requestAnimationFrame(frame);
    const now = timestampMs / 1000;
    let delta = last === null ? 0 : now - last;
    last = now;
    if (delta < 0) delta = 0;
    if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;

    accumulator += delta;
    while (accumulator >= STEP) {
      simStep();
      accumulator -= STEP;
    }
    renderFrame();
    guardFrameRate(delta);
    if (firstFrame) {
      firstFrame = false;
      hideLoading();
    }
  }

  // Coming back to a hidden tab: start timing fresh instead of catching up.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') last = null;
  });

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function setPlayer(player) {
  app.player = player;
  if (DEBUG) console.info('[roots3d] player', player.source, player.name, player.style);
  app.world?.setAvatar(player);
  app.flow?.refresh();
}

async function bootPlayer() {
  if (STATIC) {
    disableNetwork(); // no network calls in capture mode
    setPlayer(createOfflineGuest()); // fixed demo guest
    return;
  }
  consumeSessionHash();
  setPlayer(await whoami());
  watchPlayer(app.player, setPlayer);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

// Capture and cover only: resolves when face pictures have loaded and the
// fonts are ready (boot already waited for fonts before drawing any text).
function whenCaptureAssetsReady() {
  return Promise.all([whenTexturesReady(), document.fonts?.ready]).then(() => undefined);
}

function boot() {
  const canvas = document.getElementById('scene');
  try {
    app.renderer = createRenderer(canvas);
  } catch (err) {
    showFatal('3D is not available', 'ROOTS 3D needs WebGL. Try another browser or turn on hardware acceleration.');
    console.error(err);
    return;
  }

  if (STATIC) {
    disableNetwork(); // no network calls in capture or cover mode
    useMemoryStorage(); // never read or write saved progress
  }

  app.scene = new THREE.Scene();
  app.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220);
  app.world = createWorld(app.scene, app.camera);
  app.world.setAvatar(app.player);

  resetSim();
  // The game itself: rules, HUD, saved progress (not in the debug views).
  const { board, fx, plaza, storyteller } = app.world;
  if (board && !DEBUG_VIEW && !COVER) {
    app.flow = createFlow({ board, fx, plaza, storyteller, date: app.date, capture: CAPTURE, getPlayer: () => app.player, demo: CAPTURE ? CAPTURE_DEMO : null });
    if (CAPTURE) app.director = createCaptureDirector({ world: app.world, flow: app.flow, camera: app.camera, canvas });
  }
  resize();
  window.addEventListener('resize', resize);
  watchHud();
  if (!STATIC) app.world.attachInput(canvas); // capture and cover take no input

  if (DEBUG) {
    window.ROOTS = app; // app.flow exposes the game actions for console checks
    // Data checks (data/validate.js): pass/fail report in the console.
    import('./data/validate.js')
      .then((m) => m.runValidation())
      .catch((err) => console.error('[roots3d] data validation could not run', err));
    // Game logic self-tests (game.js): distance, bearing, tiers, determinism, rules.
    import('./game.js')
      .then((m) => m.runSelfTests())
      .catch((err) => console.error('[roots3d] game self-tests could not run', err));
  }

  if (COVER) {
    // Stage the cover at fixed sim times, show the preview + Save button.
    document.getElementById('hud').hidden = true;
    const advanceTo = (seconds) => {
      const target = Math.floor(seconds * 60 + 1e-6);
      while (app.sim.step < target) simStep();
    };
    const cover = createCover({ renderer: app.renderer, scene: app.scene, camera: app.camera, world: app.world, advanceTo, restoreView: resize });
    const ready = whenCaptureAssetsReady();
    // A Promise of the 1600×1000 PNG data URL: WebGL frame + title only (no HUD, no cursor).
    window.renderCover = () => ready.then(() => cover.renderCover());
    window.addEventListener('resize', () => app.renderer.render(app.scene, app.camera));
    ready.then(() => {
      showCoverPreview(document.getElementById('modal-layer'), cover.renderCover); // renders the first frame
      hideLoading();
      window.coverReady = true;
      window.captureReady = true; // capture.py waits for this in ?cover too
    });
  } else if (CAPTURE) {
    window.render = renderAt; // no requestAnimationFrame in capture mode
    window.captureLength = CAPTURE_LENGTH;
    Object.defineProperty(window, 'captureMisses', { get: () => app.director?.misses ?? [] });
    renderAt(0);
    whenCaptureAssetsReady().then(() => {
      renderAt(app.sim.time); // the first frame again, now with every texture final
      hideLoading();
      window.captureReady = true;
    });
  } else {
    startLoop();
  }

  // The world never waits for start.ng: it plays as the offline guest until whoami answers.
  bootPlayer().catch((err) => console.warn('[roots3d] start.ng player lookup failed', err));
}

// Capture and cover draw canvas text while building the scene, so they wait for
// the page's fonts first. Normal play starts at once.
if (STATIC && document.fonts?.ready) document.fonts.ready.then(boot, boot);
else boot();
