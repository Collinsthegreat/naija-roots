// The 45-second ?capture showcase. A drawn DOM cursor plays a fixed script
// against the real game: it clicks real HUD buttons and taps the board through
// its normal raycast. Everything advances in update(dt) inside the fixed sim
// step, so window.render(t) reproduces any frame, HUD included.
//
//    0–6 s   slow orbit around the explorer on its pedestal (HUD fades in at the end)
//    6–16 s  Naija Heritage Daily, target forced to Tiv; the cursor unlocks clues
//            2, 3 and 4 while the storyteller reveals stage by stage
//   16–26 s  tap Niger, pick Nupe: flight, flag, YELLOW, arc + km label + arrow
//   26–36 s  tap Benue, pick Tiv: GREEN, confetti, full reveal, results card
//   36–45 s  close the results, switch to Africa 54, the board transforms,
//            the camera settles into a slow beauty shot
//
// Positions of HUD targets are read from the DOM at the moment the cursor
// heads there (same viewport → same pixels), and 3D targets are projected
// from the live tile positions, so the cursor always lands on what it clicks.

import * as THREE from 'three';
import { smoothstep } from './geom.js';

export const CAPTURE_LENGTH = 45; // seconds

// The capture rig may go closer and further around than players can.
export const CAPTURE_CAMERA = Object.freeze({ limits: { distance: [4, 30], yaw: [-1.3, 1.3], targetRadius: 10 } });

// Passed to createFlow in capture mode: the forced Daily target and a shorter
// celebration hold, so the results card shows inside the 26–36 s window.
export const CAPTURE_DEMO = Object.freeze({ targets: Object.freeze({ naija: 'tiv' }), winHold: 2.0 });

const deg = THREE.MathUtils.degToRad;
const ORBIT = { from: 0.1, to: 0.95, distance: 5.2, pitch: deg(13), lift: 1.0 };
const STORY_SHOT = { target: [3.6, 2.5, 0.8], distance: 13.5, yaw: -0.22, pitch: deg(22) };
// Portrait screens (phones) are too narrow for the board and the storyteller
// side by side: frame the storyteller alone, above the clue sheet.
const STORY_SHOT_PORTRAIT = { target: [8.0, 1.7, 1.0], distance: 8.5, yaw: -0.5, pitch: deg(22) };
// Closing shot: the Africa board in the middle, both characters on their
// pedestals (x = ±8) fully in frame. Wide screens aim left of the island
// centre so the board sits in the middle of the area the clue panel leaves
// uncovered; portrait screens (phones) look down from closer, above the sheet.
const BEAUTY = { target: [-3.7, 1.75, 0.8], distance: 27, pitch: deg(31), yawFrom: -0.12, yawTo: 0.12, start: 39, length: 6 };
const BEAUTY_PORTRAIT = { target: [0, 1.7, 1.8], distance: 21, pitch: deg(34), yawFrom: -0.12, yawTo: 0.12 };
const RIPPLE_TIME = 0.55;
const PRESS_TIME = 0.14;
const REVEAL_MARGIN = 12; // CSS px kept between a revealed target and its box's edge

const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

// A classic arrow pointer drawn in SVG, plus a click ripple.
function createCursorElements() {
  const root = document.createElement('div');
  root.id = 'demo-cursor';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:30px;z-index:40;pointer-events:none;transform-origin:3px 3px;opacity:0;';
  // Static markup: the HTML parser puts <svg> in the SVG namespace by itself.
  root.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30"><path d="M3 3 L3 24 L8.6 18.8 L12.6 27.4 L16.4 25.7 L12.5 17.3 L20 17.3 Z" fill="#fffaf1" stroke="#2b2118" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  const ripple = document.createElement('div');
  ripple.setAttribute('aria-hidden', 'true');
  ripple.style.cssText = 'position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #c8643b;background:rgba(200,100,59,0.18);z-index:39;pointer-events:none;opacity:0;';
  document.body.append(ripple, root);
  return { root, ripple };
}

// ctx: { world, flow, camera, canvas }
export function createCaptureDirector({ world, flow, camera, canvas }) {
  const { rig, board, diorama } = world;
  const hud = document.getElementById('hud');
  const { root: cursorEl, ripple } = createCursorElements();

  let steps = 0;
  let clock = 0; // steps × dt, like the main sim (no float drift from summing)
  let next = 0; // index of the next cue
  const cursor = { x: 0, y: 0, alpha: 0, fade: 0 }; // fade: alpha change per second
  let move = null; // { t0, t1, from: {x,y}, target: () => {x,y} }
  let clickAt = -1; // sim time of the last click (ripple + press)
  const misses = []; // cues whose target was missing (should stay empty)

  // --- targets (CSS px in the viewport) -----------------------------------------

  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;

  function centre(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function find(selector, text = null) {
    const list = [...document.querySelectorAll(selector)];
    return (text === null ? list : list.filter((el) => el.textContent.trim() === text))[0] ?? null;
  }

  // Scrolls every scrollable box around the element (vertically, at once) until
  // the whole element shows, the way a player scrolls a list before clicking in
  // it. Without this the cursor would aim at items clipped out of view.
  function reveal(node) {
    if (!node) return;
    for (let box = node.parentElement; box && box !== document.body; box = box.parentElement) {
      if (box.scrollHeight <= box.clientHeight || !/auto|scroll/.test(getComputedStyle(box).overflowY)) continue;
      const r = node.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (r.bottom > b.bottom - REVEAL_MARGIN) box.scrollTop += r.bottom - (b.bottom - REVEAL_MARGIN);
      else if (r.top < b.top + REVEAL_MARGIN) box.scrollTop -= b.top + REVEAL_MARGIN - r.top;
    }
  }

  const el = (selector, text = null) => {
    const target = () => {
      const node = find(selector, text);
      return node ? centre(node) : null;
    };
    target.reveal = () => reveal(find(selector, text));
    return target;
  };

  const _v = new THREE.Vector3();
  function tileScreen(id) {
    if (!board.getTileWorldPosition(id, _v)) return null;
    camera.updateMatrixWorld();
    _v.project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((_v.x + 1) / 2) * r.width, y: r.top + ((1 - _v.y) / 2) * r.height };
  }
  const tile = (id) => () => tileScreen(id);
  const spot = (fx, fy) => () => ({ x: vw() * fx, y: vh() * fy });

  // --- actions ---------------------------------------------------------------------

  function press() {
    clickAt = clock;
  }

  function clickTarget(selector, text = null) {
    return () => {
      press();
      const node = find(selector, text);
      if (!node || node.disabled) {
        misses.push({ at: clock, selector, text });
        return;
      }
      node.click();
    };
  }

  // Taps the board where the cursor is (the board raycasts it next step).
  function tapBoard() {
    press();
    const r = canvas.getBoundingClientRect();
    board.tap(((cursor.x - r.left) / r.width) * 2 - 1, -((cursor.y - r.top) / r.height) * 2 + 1);
  }

  const moveTo = (t0, t1, target) => ({ at: t0, run: () => {
    target.reveal?.(); // HUD targets scroll into view before the cursor sets off
    move = { t0, t1, from: { x: cursor.x, y: cursor.y }, target };
  } });
  const at = (t, run) => ({ at: t, run });
  const show = (t, fx, fy) => at(t, () => {
    cursor.x = vw() * fx;
    cursor.y = vh() * fy;
    cursor.fade = 4;
  });

  const portrait = () => camera.aspect < 1;
  function storyShot() {
    const shot = portrait() ? STORY_SHOT_PORTRAIT : STORY_SHOT;
    return { ...shot, target: new THREE.Vector3(...shot.target) };
  }

  const unlock = '.clue.is-next .unlock-btn';
  const CUES = [
    // 6–16 s: storyteller close-up, three clues
    at(6.0, () => rig.setGoal(storyShot())),
    show(6.3, 0.62, 0.72),
    moveTo(6.5, 7.4, el(unlock)), at(7.6, clickTarget(unlock)),
    moveTo(8.4, 9.3, el(unlock)), at(9.5, clickTarget(unlock)),
    moveTo(10.3, 11.2, el(unlock)), at(11.4, clickTarget(unlock)),
    moveTo(12.0, 13.0, spot(0.7, 0.62)),
    at(15.0, () => rig.goHome()),
    // 16–26 s: Niger → Nupe → Confirm (YELLOW)
    moveTo(15.6, 16.7, tile('niger')), at(16.9, tapBoard),
    moveTo(17.3, 18.2, el('#picker .pick-item[data-id="nupe"]')), at(18.4, clickTarget('#picker .pick-item[data-id="nupe"]')),
    moveTo(18.7, 19.5, el('#guess-bar button[data-action="confirm"]')), at(19.7, clickTarget('#guess-bar button[data-action="confirm"]')),
    moveTo(20.1, 21.1, spot(0.86, 0.6)),
    at(23.7, () => rig.goHome()),
    // 26–36 s: Benue → Tiv → Confirm (GREEN), results card
    moveTo(24.9, 25.8, tile('benue')), at(26.0, tapBoard),
    moveTo(26.3, 27.1, el('#picker .pick-item[data-id="tiv"]')), at(27.3, clickTarget('#picker .pick-item[data-id="tiv"]')),
    moveTo(27.5, 28.2, el('#guess-bar button[data-action="confirm"]')), at(28.4, clickTarget('#guess-bar button[data-action="confirm"]')),
    moveTo(28.8, 29.8, spot(0.86, 0.6)),
    // 36–45 s: close results, Africa 54, beauty shot
    moveTo(35.3, 36.1, el('#modal-layer button', 'Close')), at(36.3, clickTarget('#modal-layer button', 'Close')),
    moveTo(36.6, 37.4, el('.seg button[data-value="africa"]')), at(37.6, clickTarget('.seg button[data-value="africa"]')),
    moveTo(38.0, 39.2, spot(0.97, 0.9)),
    at(38.6, () => { cursor.fade = -1.6; }),
  ];

  // --- camera behaviours ------------------------------------------------------------

  const _target = new THREE.Vector3();
  function orbitGoal(time) {
    const anchor = diorama.pedestals.player.anchor;
    anchor.updateWorldMatrix(true, false);
    _target.setFromMatrixPosition(anchor.matrixWorld);
    _target.y += ORBIT.lift;
    const k = smoothstep(time / 6);
    return { target: _target, distance: ORBIT.distance, pitch: ORBIT.pitch, yaw: ORBIT.from + (ORBIT.to - ORBIT.from) * k };
  }

  function beautyGoal(time) {
    const k = smoothstep((time - BEAUTY.start) / BEAUTY.length);
    const shot = portrait() ? BEAUTY_PORTRAIT : BEAUTY;
    return { target: _target.set(...shot.target), distance: shot.distance, pitch: shot.pitch, yaw: shot.yawFrom + (shot.yawTo - shot.yawFrom) * k };
  }

  // --- drawing ------------------------------------------------------------------------

  function draw() {
    const pressK = clickAt >= 0 && clock - clickAt < PRESS_TIME ? 0.84 : 1;
    cursorEl.style.opacity = cursor.alpha.toFixed(3);
    cursorEl.style.transform = `translate(${(cursor.x - 3).toFixed(1)}px, ${(cursor.y - 3).toFixed(1)}px) scale(${pressK})`;
    const age = clickAt >= 0 ? clock - clickAt : Infinity;
    if (age < RIPPLE_TIME) {
      const k = age / RIPPLE_TIME;
      ripple.style.opacity = (1 - k).toFixed(3);
      ripple.style.transform = `translate(${cursor.x.toFixed(1)}px, ${cursor.y.toFixed(1)}px) scale(${(0.35 + 0.9 * k).toFixed(3)})`;
    } else {
      ripple.style.opacity = '0';
    }
    // The HUD fades in as the intro orbit ends (5–6 s).
    hud.style.opacity = smoothstep((clock - 5) / 1).toFixed(3);
  }

  // --- sim step ---------------------------------------------------------------------------

  function update(dt) {
    steps += 1;
    clock = steps * dt;
    // Continuous camera moves first, then the cues: a cue at the same instant
    // (the 6 s storyteller shot) always wins.
    if (clock < 6) rig.setGoal(orbitGoal(clock));
    else if (clock >= BEAUTY.start) rig.setGoal(beautyGoal(clock));
    while (next < CUES.length && CUES[next].at <= clock + 1e-9) CUES[next++].run();

    if (move) {
      const target = move.target();
      if (target) {
        const u = easeInOut(Math.min(1, Math.max(0, (clock - move.t0) / (move.t1 - move.t0))));
        cursor.x = move.from.x + (target.x - move.from.x) * u;
        cursor.y = move.from.y + (target.y - move.from.y) * u;
      } else if (clock >= move.t1) {
        misses.push({ at: clock, move: true });
      }
      if (clock >= move.t1) move = null;
    }
    cursor.alpha = Math.min(1, Math.max(0, cursor.alpha + cursor.fade * dt));
    draw();
  }

  // Back to t = 0 (render(t) replays from 0 when t goes back). Runs after the
  // world and the flow have reset.
  function reset() {
    steps = 0;
    clock = 0;
    next = 0;
    move = null;
    clickAt = -1;
    misses.length = 0;
    Object.assign(cursor, { x: vw() * 0.62, y: vh() * 0.72, alpha: 0, fade: 0 });
    rig.setGoal(orbitGoal(0));
    rig.snap();
    draw();
  }

  reset();

  return {
    update,
    reset,
    get time() {
      return clock;
    },
    // Cues whose target was missing; should stay empty (window.captureMisses).
    get misses() {
      return misses.slice();
    },
  };
}
