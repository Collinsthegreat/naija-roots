// The two map boards on the island top: hex-tile cartograms of Nigeria's 37
// regions (tinted by geopolitical zone) and Africa's 54 countries (tinted by AU
// region; island nations float offshore on little rafts). No real borders are
// drawn: the layout comes from board-layout.js, labels from board-labels.js.
//
// Everything that moves (raise / fold transitions, hover lift, raft bob, label
// fades, hover picking) advances inside update(dt, t), the fixed sim step.
// Pointer events only record where the pointer is or that a tap happened; the
// raycast and the onPick callbacks run in the next sim step (CLAUDE.md §3).
//
// API: setMode('naija' | 'africa'), focusRegion(id), resetView(),
// getTileWorldPosition(id), onPick(fn), plus the wiring main.js needs.

import * as THREE from 'three';
import { createRng } from './rng.js';
import { damp, clamp, shade } from './geom.js';
import { getBoardLayout, BOARD_MODES } from './board-layout.js';
import { createLabelLayer } from './board-labels.js';
import { createBoardParts, buildDecor, DECOR_KINDS, GROUP_COLORS, LABEL_NAMES, HIGHLANDS, tileScreenPx } from './board-parts.js';

const TILE_FILL = 0.92; // tile radius / cell radius, leaving a grass gap between tiles
const TILE_BASE = 0.22; // height of a tile top above the grass
const TILE_JITTER = 0.08;
const ISLAND_TILE = 0.12; // island tile top above its raft
const ISLAND_SY = 0.32; // island tiles are squat so they never poke out under the raft
const RAFT_SCALE = 1.3; // raft circumradius in cells (board-layout.js keeps this clear)
const RAFT_Y = 0.12; // raft top above the grass
const RAFT_BOB = 0.025;
const HOVER_LIFT = 0.12;
const HOVER_TINT = 0.22;
const HOVER_LAMBDA = 14;
const TINT_AMOUNT = 0.55; // how strongly a tier tint (setTint) recolours a tile

const RAISE = { stagger: 0.35, duration: 0.7 }; // seconds; centre first
const FOLD = { stagger: 0.3, duration: 0.5 }; // seconds; edge first
const HANDOVER = 0.45; // the new board starts rising this long after the old one starts folding
const FOCUS_DISTANCE = { naija: 12, africa: 10.5 };
// Portrait screens: the picker covers the lower half, so focusing aims this far
// (world units, along the ground toward the camera) past the tile, which lifts
// the tile into the space between the top bar and the picker.
const PORTRAIT_FOCUS_LIFT = { naija: 2.6, africa: 2.0 };
const TAP_SLOP = { mouse: 6, pen: 8, touch: 12 }; // px a pointer may travel and still tap
const MIN_TAP_PX = 32; // a touch on a smaller tile zooms in there first instead of picking

// Easing.
const cubicOut = (x) => 1 - (1 - x) ** 3;
function backOut(x) {
  const c = 1.6;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}

// ---------------------------------------------------------------------------
// One board (built on setMode, disposed once it has folded away)
// ---------------------------------------------------------------------------

function buildInstance(mode, res, anchor) {
  const layout = getBoardLayout(mode);
  const cell = layout.cellSize;
  const palette = GROUP_COLORS[mode];
  const n = layout.cells.length;
  const root = new THREE.Group();
  root.name = `board-${mode}`;
  anchor.add(root);

  const maxDist = Math.max(1e-6, ...layout.cells.map((c) => Math.hypot(c.x, c.z)));
  const rest = layout.cells.map((c) => {
    const rng = createRng(`roots3d:board:${mode}:${c.id}`);
    const top = c.island ? ISLAND_TILE : TILE_BASE + rng() * TILE_JITTER + (HIGHLANDS[mode][c.id] || 0);
    const d = Math.hypot(c.x, c.z);
    return {
      ...c,
      top,
      color: shade(palette[c.group], (rng() - 0.5) * 0.12),
      // Tiles tilt toward the centre as they fold, like closing petals.
      tangent: d > 1e-6 ? new THREE.Vector3(-c.z / d, 0, c.x / d) : new THREE.Vector3(1, 0, 0),
      raise: (RAISE.stagger * d) / maxDist,
      fold: FOLD.stagger * (1 - d / maxDist),
      bob: rng() * Math.PI * 2,
    };
  });

  // Instances move during transitions, so the culling / picking sphere is set
  // by hand to cover the whole board instead of being computed from one frame.
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0), maxDist + cell * RAFT_SCALE + 1);
  const instanced = (geo, mat, count, name) => {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.boundingSphere = sphere.clone();
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    return mesh;
  };

  const tiles = instanced(res.geos.tile, res.mats.tile, n, `${mode}-tiles`);
  for (const c of rest) tiles.setColorAt(c.index, c.color);

  const islands = rest.filter((c) => c.island).map((c) => c.index);
  const rafts = islands.length ? instanced(res.geos.raft, res.mats.raft, islands.length, `${mode}-rafts`) : null;
  const raftOf = new Map(islands.map((tile, i) => [tile, i]));

  const decor = buildDecor(mode, rest, cell * TILE_FILL);
  const decos = DECOR_KINDS.filter((k) => decor[k].length).map((k) => ({
    mesh: instanced(res.geos[k], res.mats.decor, decor[k].length, `${mode}-${k}`),
    items: decor[k],
  }));

  const labels = createLabelLayer(
    rest.map((c) => ({ name: LABEL_NAMES[mode][c.id] ?? c.name, color: palette[c.group] })),
    root,
  );

  return {
    mode,
    layout,
    cell,
    root,
    tiles,
    rafts,
    raftOf,
    decos,
    labels,
    rest,
    progress: new Float32Array(n),
    foldFrom: new Float32Array(n).fill(1),
    hover: new Float32Array(n),
    curTop: new Float32Array(n),
    frames: rest.map(() => new THREE.Matrix4()),
    tints: new Map(), // tile index → THREE.Color (tier feedback, see setTint)
    phase: 'raising', // 'raising' | 'shown' | 'folding'
    clock: 0,
    delay: 0,
    colorsDirty: true,
  };
}

function disposeInstance(inst) {
  inst.tiles.dispose();
  inst.rafts?.dispose();
  for (const d of inst.decos) d.mesh.dispose();
  inst.labels.dispose();
  inst.root.removeFromParent();
}

function startFold(inst) {
  inst.foldFrom.set(inst.progress);
  inst.phase = 'folding';
  inst.clock = 0;
  inst.labels.hideAll();
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _color = new THREE.Color();
const WHITE = new THREE.Color('#ffffff');

// Advances one board by one sim step. Returns false once a fold has finished.
function stepInstance(inst, dt, t, hovered) {
  inst.clock += dt;
  const { rest, cell } = inst;
  let settled = true;
  let anyVisible = false;

  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    let p = 1;
    if (inst.phase === 'raising') {
      p = clamp((inst.clock - inst.delay - c.raise) / RAISE.duration, 0, 1);
      if (p < 1) settled = false;
    } else if (inst.phase === 'folding') {
      p = Math.min(inst.foldFrom[i], 1 - clamp((inst.clock - c.fold) / FOLD.duration, 0, 1));
      if (p > 0) settled = false;
    }
    inst.progress[i] = p;
    if (p > 0) anyVisible = true;

    const before = inst.hover[i];
    let h = damp(before, i === hovered ? 1 : 0, HOVER_LAMBDA, dt);
    if (h < 1e-3 && i !== hovered) h = 0;
    inst.hover[i] = h;
    if (h !== before) inst.colorsDirty = true;

    const grow = cubicOut(p);
    const rise = backOut(p); // overshoots a touch on the way up
    const k = 0.25 + 0.75 * grow;
    const lift = h * HOVER_LIFT;
    let base = lift;
    if (c.island) {
      const raftTop = RAFT_Y + Math.sin(t * 1.3 + c.bob) * RAFT_BOB;
      base = -0.14 + (raftTop + 0.14) * rise + lift;
    }
    const top = base - 0.2 + (c.top + 0.2) * rise;
    inst.curTop[i] = top;

    _quat.setFromAxisAngle(c.tangent, (1 - grow) * 0.75);
    _pos.set(c.x, top, c.z);
    inst.frames[i].compose(_pos, _quat, _scale.set(k, k, k));

    const r = cell * TILE_FILL * k;
    _m.compose(_pos, _quat, _scale.set(r, (c.island ? ISLAND_SY : 1) * (0.25 + 0.75 * grow), r));
    inst.tiles.setMatrixAt(i, _m);

    if (c.island) {
      const rr = cell * RAFT_SCALE * k;
      _m.compose(_pos.set(c.x, base, c.z), _quat, _scale.set(rr, 1, rr));
      inst.rafts.setMatrixAt(inst.raftOf.get(i), _m);
    }
  }
  inst.tiles.instanceMatrix.needsUpdate = true;
  if (inst.rafts) inst.rafts.instanceMatrix.needsUpdate = true;

  for (const d of inst.decos) {
    d.items.forEach((item, j) => {
      _m.multiplyMatrices(inst.frames[item.tile], item.local);
      d.mesh.setMatrixAt(j, _m);
    });
    d.mesh.instanceMatrix.needsUpdate = true;
  }

  if (inst.colorsDirty) {
    for (let i = 0; i < rest.length; i++) {
      _color.copy(rest[i].color);
      const tint = inst.tints.get(i);
      if (tint) _color.lerp(tint, TINT_AMOUNT);
      _color.lerp(WHITE, HOVER_TINT * inst.hover[i]);
      inst.tiles.setColorAt(i, _color);
    }
    inst.tiles.instanceColor.needsUpdate = true;
    inst.colorsDirty = false;
  }

  inst.root.visible = anyVisible;
  if (inst.phase === 'raising' && settled) inst.phase = 'shown';
  return !(inst.phase === 'folding' && settled);
}

// ---------------------------------------------------------------------------
// The board system
// ---------------------------------------------------------------------------

// anchor: the island top (diorama.islandAnchor). rig: the camera rig.
// mode: the board shown first. intro: raise it from the ground at t = 0.
export function createBoard({ anchor, camera, rig, mode = 'naija', intro = true }) {
  if (!BOARD_MODES.includes(mode)) throw new Error(`board: unknown mode "${mode}"`);
  const initialMode = mode;
  const res = createBoardParts();
  anchor.add(res.glow);
  res.glow.matrixAutoUpdate = false;

  let active = null;
  let leaving = [];
  let hovered = -1;
  let sticky = -1; // touch has no hover: a tap keeps its tile highlighted
  let focused = -1;
  let glowIndex = -1;
  let glowAmount = 0;
  let pointer = null; // { x, y } in NDC, from a mouse / pen, or a scripted cursor
  let taps = []; // [{ x, y, touch }] waiting for the next sim step
  const listeners = new Set();
  const viewport = { w: 1, h: 1 };
  let blockers = [];
  let obstacles = () => [];
  let inputEl = null;
  let detachInput = null;
  let cursorShown = false;

  const raycaster = new THREE.Raycaster();
  const zoomRay = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hits = [];
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ground = new THREE.Vector3();
  const glowScale = new THREE.Matrix4();

  function clearInteraction() {
    hovered = -1;
    sticky = -1;
    focused = -1;
    taps = [];
    glowIndex = -1;
    glowAmount = 0;
    res.glow.visible = false;
  }

  // Puts a board back to its first frame: rising from the ground, or shown.
  function restart(inst, animate) {
    inst.phase = animate ? 'raising' : 'shown';
    inst.clock = 0;
    inst.delay = 0;
    inst.progress.fill(animate ? 0 : 1);
    inst.foldFrom.fill(1);
    inst.hover.fill(0);
    inst.tints.clear();
    inst.colorsDirty = true;
    inst.labels.hideAll();
    stepInstance(inst, 0, 0, -1);
    return inst;
  }

  // Index of the tile under an NDC point on the shown board, or -1.
  function tileAt(x, y) {
    if (!active || active.phase !== 'shown') return -1;
    camera.updateMatrixWorld();
    active.tiles.updateWorldMatrix(true, false);
    raycaster.setFromCamera(ndc.set(x, y), camera);
    hits.length = 0;
    raycaster.intersectObject(active.tiles, false, hits);
    return hits.length ? hits[0].instanceId : -1;
  }

  function restTop(c) {
    return c.island ? RAFT_Y + ISLAND_TILE : c.top;
  }

  // --- API --------------------------------------------------------------------

  // Swaps boards: the current one folds into the island, the new one rises.
  // Returns false if that board is already showing.
  function setMode(next) {
    if (!BOARD_MODES.includes(next)) throw new Error(`board: unknown mode "${next}"`);
    if (active && active.mode === next) return false;
    clearInteraction();
    let delay = 0;
    if (active) {
      startFold(active);
      leaving.push(active);
      delay = HANDOVER;
    }
    active = restart(buildInstance(next, res, anchor), true);
    active.delay = delay;
    rig.goHome();
    return true;
  }

  // Damps the camera in on a region. Returns false if it isn't on this board.
  function focusRegion(id) {
    const i = active?.layout.index[id];
    if (i === undefined) return false;
    focused = i;
    const target = getTileWorldPosition(id, new THREE.Vector3(), { rest: true });
    if (viewport.h > viewport.w) {
      const lift = PORTRAIT_FOCUS_LIFT[active.mode];
      target.x += Math.sin(rig.goal.yaw) * lift;
      target.z += Math.cos(rig.goal.yaw) * lift;
    }
    rig.setGoal({ target, distance: FOCUS_DISTANCE[active.mode] });
    return true;
  }

  function resetView() {
    focused = -1;
    rig.goHome();
  }

  // World position of a tile's top centre (live, including lift and raft bob),
  // or its resting position with { rest: true }. null if not on this board.
  function getTileWorldPosition(id, out = new THREE.Vector3(), { rest = false } = {}) {
    const i = active?.layout.index[id];
    if (i === undefined) return null;
    const c = active.rest[i];
    anchor.updateWorldMatrix(true, false);
    return out.set(c.x, rest ? restTop(c) : active.curTop[i], c.z).applyMatrix4(anchor.matrixWorld);
  }

  // Recolours a tile toward `color` (tier feedback) until clearTints() or a
  // board switch; null removes it. Returns false if the tile isn't on this board.
  function setTint(id, color) {
    const i = active?.layout.index[id];
    if (i === undefined) return false;
    if (color === null || color === undefined) active.tints.delete(i);
    else active.tints.set(i, new THREE.Color(color));
    active.colorsDirty = true;
    return true;
  }

  function clearTints() {
    if (!active || !active.tints.size) return;
    active.tints.clear();
    active.colorsDirty = true;
  }

  // fn(id, cell) runs (in the sim step) when a tile is tapped or clicked.
  // Returns a function that removes the listener.
  function onPick(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Scripted pointer (the capture demo cursor) or null. NDC coordinates.
  function setPointer(x, y) {
    pointer = x === null || x === undefined ? null : { x, y };
  }

  // A scripted tap at an NDC point; handled in the next sim step.
  function tap(x, y, { touch = false } = {}) {
    taps.push({ x, y, touch });
  }

  function setViewport(w, h) {
    viewport.w = Math.max(1, w);
    viewport.h = Math.max(1, h);
  }

  // HUD rectangles labels must stay clear of: [{ left, top, right, bottom }] in CSS px.
  function setBlockers(rects) {
    blockers = rects.slice();
  }

  // 3D things labels must not cover: fn() → [{ a, b, radius }] world capsules.
  function setObstacles(fn) {
    obstacles = fn;
  }

  // Mouse, pen and touch on the canvas. Only records input; see update().
  function attachInput(el) {
    detachInput?.();
    inputEl = el;
    const gestures = new Map(); // pointerId → { x, y, travel, type }
    let multi = false;

    const toNdc = (clientX, clientY) => {
      const r = el.getBoundingClientRect();
      return { x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 };
    };

    // Zoom toward the board point under the pointer.
    rig.setZoomAnchor((clientX, clientY) => {
      const p = toNdc(clientX, clientY);
      anchor.updateWorldMatrix(true, false);
      plane.constant = -(anchor.matrixWorld.elements[13] + TILE_BASE);
      zoomRay.setFromCamera(ndc.set(p.x, p.y), camera);
      return zoomRay.ray.intersectPlane(plane, ground) ? ground.clone() : null;
    });

    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      gestures.set(e.pointerId, { x: e.clientX, y: e.clientY, travel: 0, type: e.pointerType });
      if (gestures.size > 1) multi = true;
    }
    function onMove(e) {
      const g = gestures.get(e.pointerId);
      if (g) {
        g.travel += Math.hypot(e.clientX - g.x, e.clientY - g.y);
        g.x = e.clientX;
        g.y = e.clientY;
      }
      if (e.pointerType !== 'touch') pointer = toNdc(e.clientX, e.clientY);
    }
    function onUp(e) {
      const g = gestures.get(e.pointerId);
      if (!g) return;
      gestures.delete(e.pointerId);
      if (!multi && g.travel <= (TAP_SLOP[g.type] ?? TAP_SLOP.pen)) {
        const p = toNdc(e.clientX, e.clientY);
        taps.push({ x: p.x, y: p.y, touch: g.type === 'touch' });
      }
      if (gestures.size === 0) multi = false;
    }
    function onCancel(e) {
      gestures.delete(e.pointerId);
      if (gestures.size === 0) multi = false;
    }
    function onLeave(e) {
      if (e.pointerType !== 'touch') pointer = null;
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    detachInput = () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
      rig.setZoomAnchor(null);
      el.style.cursor = '';
      inputEl = null;
      detachInput = null;
    };
    return detachInput;
  }

  // --- sim step ---------------------------------------------------------------

  function update(dt, t) {
    // Picking first, against last step's tile positions (what is on screen).
    const pointed = pointer ? tileAt(pointer.x, pointer.y) : -1;
    for (const tp of taps) {
      const i = tileAt(tp.x, tp.y);
      if (tp.touch) sticky = i;
      // A fingertip can't pick out a tile this small (the Africa board on a
      // phone): the first tap zooms in on it, the next one picks. Never from
      // close up, so a tap can't get stuck zooming.
      if (i >= 0 && tp.touch && tileScreenPx(active.tiles, i, camera, viewport.w, viewport.h) < MIN_TAP_PX && rig.goal.distance > FOCUS_DISTANCE[active.mode] + 0.5) {
        focusRegion(active.layout.cells[i].id);
        continue;
      }
      if (i >= 0) {
        const cell = active.layout.cells[i];
        for (const fn of [...listeners]) fn(cell.id, cell);
      }
    }
    taps = [];
    hovered = pointed >= 0 ? pointed : sticky;

    if (inputEl && cursorShown !== pointed >= 0) {
      cursorShown = pointed >= 0;
      inputEl.style.cursor = cursorShown ? 'pointer' : '';
    }

    leaving = leaving.filter((inst) => {
      if (stepInstance(inst, dt, t, -1)) return true;
      disposeInstance(inst);
      return false;
    });
    if (active) stepInstance(active, dt, t, hovered);

    // Rim glow follows the hovered tile and fades out after it.
    if (hovered >= 0) glowIndex = hovered;
    glowAmount = damp(glowAmount, hovered >= 0 ? 1 : 0, HOVER_LAMBDA, dt);
    if (glowAmount < 0.01 && hovered < 0) glowAmount = 0;
    if (active && glowIndex >= 0 && glowAmount > 0) {
      const r = active.cell * TILE_FILL;
      res.glow.matrix.multiplyMatrices(active.frames[glowIndex], glowScale.makeScale(r, 1, r));
      res.glow.matrixWorldNeedsUpdate = true;
      const pulse = 0.85 + 0.15 * Math.sin(t * 5);
      res.glowMats[0].opacity = glowAmount * pulse;
      res.glowMats[1].opacity = glowAmount * 0.5 * pulse;
      res.glow.visible = true;
    } else {
      res.glow.visible = false;
    }

    if (active) {
      camera.updateMatrixWorld();
      const { rest, curTop } = active;
      active.labels.update(dt, {
        camera,
        width: viewport.w,
        height: viewport.h,
        blockers,
        obstacles: obstacles(),
        anchors: (i, out) => out.set(rest[i].x, curTop[i], rest[i].z),
        cellSize: active.cell,
        hovered,
        focused,
        enabled: active.phase === 'shown',
      });
    }
  }

  // Back to the t = 0 state (capture replays from 0). The first board is
  // reused when it is still the one showing.
  function reset() {
    for (const inst of leaving) disposeInstance(inst);
    leaving = [];
    if (active && active.mode !== initialMode) {
      disposeInstance(active);
      active = null;
    }
    clearInteraction();
    pointer = null;
    active = restart(active ?? buildInstance(initialMode, res, anchor), intro);
  }

  function dispose() {
    detachInput?.();
    for (const inst of leaving) disposeInstance(inst);
    if (active) disposeInstance(active);
    leaving = [];
    active = null;
    listeners.clear();
    res.dispose();
  }

  reset();

  return {
    get mode() {
      return active?.mode ?? null;
    },
    get transitioning() {
      return leaving.length > 0 || active?.phase !== 'shown';
    },
    get cells() {
      return active?.layout.cells ?? [];
    },
    get hoveredId() {
      return hovered >= 0 && active ? active.layout.cells[hovered].id : null;
    },
    // World circumradius of one tile cell, and world units per km (FX scale).
    get cellSize() {
      return active?.cell ?? 0;
    },
    get kmScale() {
      return active?.layout.kmScale ?? 0;
    },
    setMode,
    focusRegion,
    resetView,
    getTileWorldPosition,
    onPick,
    setTint,
    clearTints,
    setPointer,
    tap,
    setViewport,
    setBlockers,
    setObstacles,
    attachInput,
    update,
    reset,
    dispose,
  };
}
