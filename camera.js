// Slow-damped orbit camera rig. Input only moves the *goal*; the camera itself
// approaches the goal inside update(dt), which runs in the fixed sim step
// (CLAUDE.md §3). Capture mode never attaches input, so it stays deterministic.
//
// Narrow screens pull the camera back (fit) so the whole diorama is in frame at
// the home distance. The pull-back fades out as you zoom in, so phones can still
// get close enough to read the board. Zooming moves the target toward the point
// under the pointer when a zoom anchor is set (see setZoomAnchor).

import * as THREE from 'three';
import { damp, clamp } from './geom.js';

const DEFAULTS = {
  target: [0, 1.7, 0.4],
  distance: 21,
  yaw: 0,
  pitch: THREE.MathUtils.degToRad(36),
  limits: {
    yaw: [-0.75, 0.75],
    pitch: [THREE.MathUtils.degToRad(22), THREE.MathUtils.degToRad(62)],
    distance: [10, 30],
    targetRadius: 5.4, // how far the target may wander from home (x/z)
  },
  lambda: 4.0, // damping rate; lower = slower, floatier
  fitWidth: 23.3, // keep roughly this much of the diorama in frame on narrow screens
  // Portrait screens (phones): the whole island is too small to tap, so the
  // home view frames the board alone: steeper, aimed a little south, with about
  // this much width in frame. Zooming out still reaches the whole island.
  portraitHome: { target: [0, 1.7, 2.8], pitch: THREE.MathUtils.degToRad(60), fitWidth: 9.5 },
};

const DRAG_YAW = 0.0055;
const DRAG_PITCH = 0.004;
const WHEEL_ZOOM = 0.0012;
const CLICK_SLOP = 6; // px a pointer may move and still count as a tap

export function createCameraRig(camera, options = {}) {
  const cfg = { ...DEFAULTS, ...options, limits: { ...DEFAULTS.limits, ...(options.limits || {}) } };
  const home = {
    target: new THREE.Vector3(...cfg.target),
    distance: cfg.distance,
    yaw: cfg.yaw,
    pitch: cfg.pitch,
  };
  // The home view in use: `home`, or on portrait screens the portrait home
  // (setAspect). A custom home (the debug views) has no portrait variant.
  const portrait = options.target || !cfg.portraitHome ? null : {
    target: new THREE.Vector3(...cfg.portraitHome.target),
    distance: home.distance, // set by setAspect
    yaw: home.yaw,
    pitch: cfg.portraitHome.pitch,
  };
  let homeNow = home;
  const state = { target: home.target.clone(), distance: home.distance, yaw: home.yaw, pitch: home.pitch };
  const goal = { target: home.target.clone(), distance: home.distance, yaw: home.yaw, pitch: home.pitch };
  let fit = 1; // distance multiplier for narrow / portrait screens, at home distance
  let lastGestureWasDrag = false;
  let zoomAnchor = null; // (clientX, clientY) => Vector3 | null

  const view = { yaw: state.yaw, pitch: state.pitch, distance: state.distance };

  function clampGoal() {
    goal.yaw = clamp(goal.yaw, cfg.limits.yaw[0], cfg.limits.yaw[1]);
    goal.pitch = clamp(goal.pitch, cfg.limits.pitch[0], cfg.limits.pitch[1]);
    goal.distance = clamp(goal.distance, cfg.limits.distance[0], cfg.limits.distance[1]);
    const dx = goal.target.x - home.target.x;
    const dz = goal.target.z - home.target.z;
    const reach = Math.hypot(dx, dz);
    if (reach > cfg.limits.targetRadius) {
      const k = cfg.limits.targetRadius / reach;
      goal.target.x = home.target.x + dx * k;
      goal.target.z = home.target.z + dz * k;
    }
  }

  // Full fit at (and beyond) the home distance, none at the closest zoom.
  function fitAt(distance) {
    const span = home.distance - cfg.limits.distance[0];
    const s = span > 0 ? clamp((distance - cfg.limits.distance[0]) / span, 0, 1) : 1;
    return Math.pow(fit, s);
  }

  function apply() {
    const d = state.distance * fitAt(state.distance);
    const cp = Math.cos(state.pitch);
    camera.position.set(
      state.target.x + Math.sin(state.yaw) * cp * d,
      state.target.y + Math.sin(state.pitch) * d,
      state.target.z + Math.cos(state.yaw) * cp * d,
    );
    camera.lookAt(state.target);
    view.yaw = state.yaw;
    view.pitch = state.pitch;
    view.distance = d;
  }

  // --- sim side -------------------------------------------------------------

  function update(dt) {
    const k = 1 - Math.exp(-cfg.lambda * dt);
    state.target.lerp(goal.target, k);
    state.distance = damp(state.distance, goal.distance, cfg.lambda, dt);
    state.yaw = damp(state.yaw, goal.yaw, cfg.lambda, dt);
    state.pitch = damp(state.pitch, goal.pitch, cfg.lambda, dt);
    apply();
  }

  // Jump straight to the goal (e.g. after a mode switch).
  function snap() {
    state.target.copy(goal.target);
    state.distance = goal.distance;
    state.yaw = goal.yaw;
    state.pitch = goal.pitch;
    apply();
  }

  // Back to the home framing, instantly. Used when the sim replays from 0.
  function reset() {
    goHome();
    snap();
  }

  // Back to the home framing, smoothly (resetView).
  function goHome() {
    goal.target.copy(homeNow.target);
    goal.distance = homeNow.distance;
    goal.yaw = homeNow.yaw;
    goal.pitch = homeNow.pitch;
  }

  // Partial goal: { target: Vector3|[x,y,z], distance, yaw, pitch }. Clamped to limits.
  function setGoal({ target, distance, yaw, pitch } = {}) {
    if (target) {
      if (Array.isArray(target)) goal.target.set(target[0], target[1], target[2]);
      else goal.target.copy(target);
    }
    if (distance !== undefined) goal.distance = distance;
    if (yaw !== undefined) goal.yaw = yaw;
    if (pitch !== undefined) goal.pitch = pitch;
    clampGoal();
  }

  // Narrow screens pull the camera back so the diorama's width still fits.
  function setAspect(aspect) {
    const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
    const needed = cfg.fitWidth / 2 / (Math.tan(halfV) * Math.max(aspect, 0.1));
    fit = Math.max(1, needed / home.distance);
    const before = homeNow;
    const resting = atHome(before); // the boot reset runs before the first resize
    homeNow = portrait && aspect < 1 ? portrait : home;
    if (portrait) {
      // The goal distance whose on-screen distance (distance × fitAt) shows
      // portraitHome.fitWidth across: fitAt grows with distance, so bisect.
      const want = cfg.portraitHome.fitWidth / 2 / (Math.tan(halfV) * Math.max(aspect, 0.1));
      let lo = cfg.limits.distance[0];
      let hi = home.distance;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (mid * fitAt(mid) < want) lo = mid;
        else hi = mid;
      }
      portrait.distance = (lo + hi) / 2;
    }
    if (resting && (homeNow !== before || homeNow === portrait)) {
      goHome(); // a resting camera follows its home (boot, rotation, resize)
      snap();
      return;
    }
    apply();
  }

  // Goal and camera both sitting on this home view (nothing has moved them).
  function atHome(h) {
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    return near(goal.distance, h.distance) && near(state.distance, h.distance)
      && near(goal.pitch, h.pitch) && near(goal.yaw, h.yaw)
      && goal.target.distanceToSquared(h.target) < 1e-10 && state.target.distanceToSquared(h.target) < 1e-10;
  }

  // --- input side (outside the sim: only changes goals) ------------------------

  // Zoom by `factor` (< 1 zooms in). Zooming in drifts the target toward the
  // point under the pointer; zooming out drifts it back toward home.
  function zoomBy(factor, clientX, clientY) {
    const before = goal.distance;
    goal.distance *= factor;
    clampGoal();
    const after = goal.distance;
    if (after < before) {
      const p = zoomAnchor?.(clientX, clientY);
      if (p) goal.target.lerp(p, 1 - after / before);
    } else if (after > before) {
      goal.target.lerp(homeNow.target, 1 - before / after);
    }
    clampGoal();
  }

  function attachInput(el) {
    const pointers = new Map();
    let pinchDist = 0;
    let travelled = 0;

    function pinchSpan() {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) travelled = 0;
      if (pointers.size === 2) pinchDist = pinchSpan();
    }

    function onMove(e) {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;
      travelled += Math.abs(dx) + Math.abs(dy);

      if (pointers.size === 1) {
        goal.yaw -= dx * DRAG_YAW;
        goal.pitch += dy * DRAG_PITCH;
        clampGoal();
      } else if (pointers.size === 2) {
        const span = pinchSpan();
        if (pinchDist > 0 && span > 0) {
          const [a, b] = [...pointers.values()];
          zoomBy(pinchDist / span, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
        pinchDist = span;
      }
    }

    function onUp(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      el.releasePointerCapture?.(e.pointerId);
      if (pointers.size === 0) lastGestureWasDrag = travelled > CLICK_SLOP;
      if (pointers.size < 2) pinchDist = 0;
    }

    function onWheel(e) {
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomBy(Math.exp(delta * WHEEL_ZOOM), e.clientX, e.clientY);
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }

  apply();

  return {
    update,
    snap,
    reset,
    goHome,
    setGoal,
    setZoomAnchor(fn) {
      zoomAnchor = fn;
    },
    setAspect,
    attachInput,
    view, // live { yaw, pitch, distance } for the diorama (clouds, fog)
    get homeDistance() {
      return homeNow.distance;
    },
    // A copy of the current goal { target, distance, yaw, pitch } (tours start from it).
    get goal() {
      return { target: goal.target.clone(), distance: goal.distance, yaw: goal.yaw, pitch: goal.pitch };
    },
    get wasDrag() {
      return lastGestureWasDrag; // lets board picking ignore the end of a drag
    },
  };
}
