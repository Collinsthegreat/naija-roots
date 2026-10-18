// Effects for ROOTS 3D: the explorer's drone flight to a tile and back, flag
// planting with a dust burst, glowing trajectory arcs with a distance label and
// a bearing arrow, tier pulses on tiles, and the victory confetti.
//
// Determinism (CLAUDE.md §3): everything advances in update(dt, t), which runs
// inside the fixed sim step right after the avatar's idle tick. Sequencing uses
// a sim-time timer queue, never promises or wall-clock timers, so a capture
// replay reaches exactly the same frame. Every random number comes from a
// PRNG seeded per effect and counted from reset().
//
// Space: flags, arcs, arrows, labels, rings and particles live in a group on
// the island top (island-anchor space), so they bob with the island. The
// avatar stays parented to its pedestal; its flight is computed in pedestal
// space each step from the live tile position.
//
// Call clear() when a run is dismissed (results closed, new run, mode switch):
// it removes every flag, arc, label, tint and particle, and sends the avatar
// home at once.

import * as THREE from 'three';
import { createRng, randRange } from './rng.js';
import { clamp, smoothstep, disposeObject } from './geom.js';
import { makeFlag, arcColor } from './avatar.js';
import { normaliseStyle } from './startng.js';
import {
  TIER_COLORS,
  createParticles,
  createPulseRings,
  createArrows,
  createLabelObstacles,
  createArc,
  createDistanceLabel,
  createTierMarks,
  dustParticle,
  confettiParticle,
  dustGeometry,
  confettiGeometry,
  groupDigits,
  compassDir,
  angleDelta,
  bezier,
  bezierTangent,
  easeOutBack,
} from './fx-parts.js';

export { TIER_COLORS };

const FLIGHT_OUT = 1.8; // seconds, pedestal → tile
const FLIGHT_HOME = 1.6; // seconds, tile → pedestal
const GRAB = 0.3; // seconds for the drone to move overhead (and back)
const CARRY = new THREE.Vector3(0, 2.38, 0.02); // drone spot while carrying (avatar space)
const ARM_UP = Math.PI - 0.42; // arm angle when holding the drone
const YAW_LAMBDA = 7;
const HOLD = { miss: 1.9, win: 3.0 }; // seconds on the tile before flying home
const EFFECT_DELAY = 0.35; // after landing: arc or victory starts

const FLAG_HEIGHT = 1.1; // makeFlag height before scaling
const PLANT_TIME = 0.55;
const PLANT_HIT = 0.28; // when the pole meets the tile
const ARC_GROW = 0.9;
const LABEL_POP = 0.45;
const LABEL_PX = 30; // distance label height in CSS px (constant on screen)
const ARC_MIN = 0.9; // arc length limits (world units)
const ARC_MAX = 6.0;
const ARC_REACH = 6.0; // arc ends stay within this distance of the island centre
const MAX_ARCS = 3; // one per wrong guess (3 guesses)
// Phone win shot, inside the player camera limits: target offset from the storyteller's pedestal top.
const PORTRAIT_WIN = { offset: [-3.3, -0.5, 1.9], distance: 12, yaw: -0.75, pitch: THREE.MathUtils.degToRad(22) };

const DUST_COLORS = ['#e6c993', '#d9b98a', '#cfae7c', '#f0dcb4'];
const CONFETTI_GOLD = ['#e3b23c', '#fff1c9', '#3f9b5a', '#e07a2f'];

const DUST_PHYSICS = { gravity: 2.4, drag: 4.2, terminal: Infinity, flutter: 0, fadeOut: 0.35 };
const CONFETTI_PHYSICS = { gravity: 5.5, drag: 1.5, terminal: 0.95, flutter: 0.55, fadeOut: 0.7 };

const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// createFx
// ---------------------------------------------------------------------------

// ctx: { islandAnchor, playerAnchor, storytellerAnchor, board, rig, camera,
//        storyteller, getAvatar: () => avatar root | null, getPlayer: () => player }
export function createFx(ctx) {
  const { islandAnchor, playerAnchor, storytellerAnchor, board, rig, camera, storyteller, getAvatar, getPlayer } = ctx;

  const root = new THREE.Group();
  root.name = 'fx';
  islandAnchor.add(root);

  const dustGeo = dustGeometry();
  const dustMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
  const dust = createParticles('fx-dust', dustGeo, dustMat, 72, DUST_PHYSICS);
  const confettiGeo = confettiGeometry();
  const confettiMat = new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide });
  const confetti = createParticles('fx-confetti', confettiGeo, confettiMat, 240, CONFETTI_PHYSICS);
  const rings = createPulseRings(12);
  const arrows = createArrows(MAX_ARCS);
  const marks = createTierMarks(8);
  root.add(dust.mesh, confetti.mesh, rings.mesh, arrows.mesh, marks.mesh);
  const marked = []; // { tileId, color }: guessed tiles and their tier
  let viewportH = 1;

  let clock = 0;
  let seq = 0; // effects spawned since reset(): seeds their PRNGs
  let timers = [];
  let busy = false;

  // --- space helpers ----------------------------------------------------------

  const _w = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();

  // Live top centre of a tile in island-anchor space, or null.
  function tileLocal(id, out = new THREE.Vector3(), rest = false) {
    if (!board.getTileWorldPosition(id, out, { rest })) return null;
    return islandAnchor.worldToLocal(out);
  }

  function tileRadius() {
    return board.cellSize * 0.92;
  }

  // Avatar and flag sizes on the board, from the tile size.
  function landScale() {
    return clamp(board.cellSize * 0.85, 0.34, 0.58);
  }

  // Where the explorer stands on a tile: front-left of the centre, so the flag
  // at the centre stays visible.
  function landingLocal(id, out) {
    if (!tileLocal(id, out)) return null;
    const r = tileRadius();
    out.x -= r * 0.45;
    out.z += r * 0.32;
    return out;
  }

  // island-anchor space → pedestal space
  function islandToPedestal(v) {
    playerAnchor.updateWorldMatrix(true, false);
    return playerAnchor.worldToLocal(islandAnchor.localToWorld(v));
  }

  function after(delay, fn) {
    timers.push({ at: clock + delay, fn });
  }

  // --- avatar flight -------------------------------------------------------------

  const pose = { pos: new THREE.Vector3(), scale: 1, yaw: 0, lean: 0, carry: 0 };
  let flight = null; // { tile (null = home), start, elapsed, duration, scaleFrom, scaleTo, onLand }
  let perch = null; // tile id the explorer is standing on

  function startFlight(tile, duration, scaleTo, onLand) {
    flight = { tile, start: pose.pos.clone(), elapsed: 0, duration, scaleFrom: pose.scale, scaleTo, onLand };
    perch = null;
  }

  // Lifts off on the drone and lands on a tile (about 1.8 s). Returns false if
  // the explorer is already flying or the tile isn't on the board.
  function flyAvatarTo(tileId, { onLand } = {}) {
    if (flight || !tileLocal(tileId, _a)) return false;
    startFlight(tileId, FLIGHT_OUT, landScale(), onLand);
    return true;
  }

  // Flies back to the pedestal. Returns false if flying or already home.
  function flyHome({ onLand } = {}) {
    if (flight || (perch === null && pose.pos.lengthSq() < 1e-8)) return false;
    startFlight(null, FLIGHT_HOME, 1, onLand);
    return true;
  }

  function snapHome() {
    flight = null;
    perch = null;
    pose.pos.set(0, 0, 0);
    pose.scale = 1;
    pose.yaw = 0;
    pose.lean = 0;
    pose.carry = 0;
  }

  // Flight end point in pedestal space (live), or null if the tile is gone.
  function flightEnd(out) {
    if (flight.tile === null) return out.set(0, 0, 0);
    return landingLocal(flight.tile, out) ? islandToPedestal(out) : null;
  }

  const P1 = new THREE.Vector3();
  const P2 = new THREE.Vector3();
  const P3 = new THREE.Vector3();
  const tangent = new THREE.Vector3();

  function stepFlight(dt) {
    let yawGoal = 0;
    if (flight) {
      if (!flightEnd(P3)) {
        snapHome();
        return;
      }
      // Snap within half a step so 1.8 s lands on step 108, not 109 (float sums).
      flight.elapsed += dt;
      if (flight.elapsed > flight.duration - dt * 0.5) flight.elapsed = flight.duration;
      const e = flight.elapsed;
      const s = e / flight.duration;
      const u = 0.5 - 0.5 * Math.cos(Math.PI * s);
      const P0 = flight.start;
      const span = Math.hypot(P3.x - P0.x, P3.z - P0.z);
      const rise = 1.3 + span * 0.12;
      P1.copy(P0).addScaledVector(UP, rise);
      P2.copy(P3).addScaledVector(UP, rise);
      bezier(P0, P1, P2, P3, u, pose.pos);
      bezierTangent(P0, P1, P2, P3, u, tangent);
      if (Math.hypot(tangent.x, tangent.z) > 1e-3) yawGoal = Math.atan2(tangent.x, tangent.z);
      else yawGoal = pose.yaw;
      pose.scale = flight.scaleFrom + (flight.scaleTo - flight.scaleFrom) * smoothstep(s);
      pose.lean = 0.2 * Math.sin(Math.PI * s);
      pose.carry = smoothstep(Math.min(e / GRAB, (flight.duration - e) / GRAB, 1));

      if (e >= flight.duration) {
        const { tile, onLand } = flight;
        flight = null;
        perch = tile;
        pose.lean = 0;
        pose.carry = 0;
        if (tile !== null) {
          puffDust(landingLocal(tile, _b), landScale() * 0.8, 8);
        }
        onLand?.();
      }
    } else if (perch !== null) {
      if (!landingLocal(perch, _a)) {
        snapHome();
        return;
      }
      pose.pos.copy(islandToPedestal(_a));
      // Face the camera while standing on the board.
      playerAnchor.worldToLocal(_w.copy(camera.position));
      yawGoal = Math.atan2(_w.x - pose.pos.x, _w.z - pose.pos.z);
    }
    pose.yaw += angleDelta(pose.yaw, yawGoal) * (1 - Math.exp(-YAW_LAMBDA * dt));
  }

  // Writes the pose onto the avatar after its idle tick has run.
  function applyPose(avatar) {
    if (!avatar) return;
    avatar.position.copy(pose.pos);
    avatar.rotation.order = 'YXZ';
    avatar.rotation.set(pose.lean, pose.yaw, 0);
    avatar.scale.setScalar(pose.scale);
    const w = pose.carry;
    const { drone, leftArm, rightArm, leftLeg, rightLeg } = avatar.userData.parts;
    // The idle tick never moves the legs, so they are always set here.
    const dangle = Math.sin(clock * 4.2) * 0.22 * w;
    leftLeg.rotation.x = dangle;
    rightLeg.rotation.x = -dangle;
    if (w <= 0) return;
    drone.position.lerp(CARRY, w);
    drone.rotation.y *= 1 - w;
    drone.rotation.z *= 1 - w;
    leftArm.rotation.z += (-ARM_UP - leftArm.rotation.z) * w;
    rightArm.rotation.z += (ARM_UP - rightArm.rotation.z) * w;
    leftArm.rotation.x *= 1 - w;
    rightArm.rotation.x *= 1 - w;
  }

  // --- dust --------------------------------------------------------------------

  // A small burst of dust at `at` (island space), sized by `scale`.
  function puffDust(at, scale, count = 14) {
    if (!at) return;
    const rng = createRng(`roots3d:fx:dust:${seq++}`);
    dust.spawn(rng, count, dustParticle(at.clone(), scale, DUST_COLORS));
  }

  // --- flags -------------------------------------------------------------------

  const flags = []; // { tileId, group, scale, age, hit, lean }

  // Plants the player's flag (primaryColor banner with their face) at the
  // tile's centre: it drops in, bites into the tile, wobbles and kicks up dust.
  function plantFlag(tileId, player = getPlayer()) {
    if (!tileLocal(tileId, _a)) return false;
    const group = makeFlag(player, { height: FLAG_HEIGHT });
    const scale = landScale() * 1.15;
    group.scale.setScalar(scale);
    group.visible = false;
    root.add(group);
    const rng = createRng(`roots3d:fx:flag:${seq++}`);
    flags.push({ tileId, group, scale, age: 0, hit: false, lean: randRange(rng, -0.25, 0.25) });
    return true;
  }

  function stepFlags(dt, t) {
    for (const f of flags) {
      f.age += dt;
      if (!tileLocal(f.tileId, _a)) {
        f.group.visible = false;
        continue;
      }
      const h = FLAG_HEIGHT * f.scale;
      const a = f.age;
      let y;
      let wobble = 0;
      let grow = 1;
      if (a < PLANT_HIT) {
        const k = a / PLANT_HIT;
        y = (1 - k * k) * 0.8 * h; // falls, speeding up
        grow = smoothstep(k / 0.35);
      } else {
        const b = a - PLANT_HIT;
        y = -0.09 * h * (1 - smoothstep(b / (PLANT_TIME - PLANT_HIT)));
        wobble = 0.24 * Math.exp(-5 * b) * Math.sin(b * 17);
        if (!f.hit) {
          f.hit = true;
          puffDust(_b.copy(_a), f.scale, 14);
        }
      }
      f.group.position.set(_a.x, _a.y + y, _a.z);
      f.group.rotation.set(wobble * 0.4, f.lean, wobble);
      f.group.scale.setScalar(f.scale * grow);
      f.group.visible = grow > 0.001;
      f.group.userData.tick(t);
    }
  }

  // --- trajectory arcs -------------------------------------------------------------

  const arcs = []; // { arc, label, slot, dir, end, yaw, arrowScale, age }

  // A glowing tube in the player's secondaryColor from the guessed tile's flag,
  // heading toward the target: 8-point bearing direction, length from the
  // distance (board km scale, clamped). A floating label shows "km · bearing"
  // and a 3D arrow at the end points along the bearing. The arc never aims at
  // the target tile itself, so it reveals nothing the feedback doesn't.
  // toTargetDirection: { bearing, distanceKm }.
  function trajectoryArc(fromId, toTargetDirection, tier, player = getPlayer()) {
    const { bearing, distanceKm } = toTargetDirection || {};
    const dir = compassDir(bearing);
    if (!dir || tier === 'green' || !tileLocal(fromId, _a, true)) return false;
    if (arcs.length >= MAX_ARCS) removeArc(arcs[0]);

    const start = _a.clone();
    start.y += FLAG_HEIGHT * landScale() * 1.15 * 0.9; // the flag top
    let length = clamp((Number(distanceKm) || 0) * board.kmScale, ARC_MIN, ARC_MAX);
    // Keep the end over the table: shorten until it's inside ARC_REACH.
    for (let i = 0; i < 20 && Math.hypot(start.x + dir.x * length, start.z + dir.z * length) > ARC_REACH; i++) {
      length = Math.max(ARC_MIN, length * 0.9);
    }
    // The arc ends (and the arrow floats) above the tile's trees and huts.
    const lift = clamp(board.cellSize * 0.45, 0.2, 0.32);
    const end = new THREE.Vector3(start.x + dir.x * length, _a.y + lift, start.z + dir.z * length);
    const color = player ? normaliseStyle(player.style).secondaryColor : arcColor(null);
    const arc = createArc(start, end, 0.55 + length * 0.2, color);
    root.add(arc.group);

    const label = createDistanceLabel(`${groupDigits(distanceKm)} km · ${bearing}`, TIER_COLORS[tier] ?? TIER_COLORS.red);
    label.sprite.visible = false;
    root.add(label.sprite);

    const used = new Set(arcs.map((x) => x.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    arcs.push({
      arc,
      label,
      slot,
      dir: dir.clone(),
      end,
      yaw: Math.atan2(dir.x, dir.z),
      arrowScale: clamp(board.cellSize * 1.5, 0.6, 1.05),
      age: 0,
    });
    arrows.set(slot, end, 0, 0, TIER_COLORS[tier] ?? TIER_COLORS.red); // colour now, shown later
    return true;
  }

  function removeArc(entry) {
    entry.arc.dispose();
    entry.label.dispose();
    arrows.hide(entry.slot);
    arcs.splice(arcs.indexOf(entry), 1);
  }

  function stepArcs(dt, t) {
    for (const x of arcs) {
      x.age += dt;
      x.arc.setProgress(smoothstep(x.age / ARC_GROW));
      x.arc.setGlow(0.8 + 0.2 * Math.sin(t * 4 + x.slot));

      const pop = clamp((x.age - LABEL_POP) / 0.3, 0, 1);
      const h = ((LABEL_PX * 2) / (camera.projectionMatrix.elements[5] * viewportH)) * easeOutBack(pop);
      x.label.sprite.visible = pop > 0;
      x.labelPx = LABEL_PX * easeOutBack(pop); // on-screen height (labelObstacles reads it)
      x.label.sprite.scale.set(h * x.label.aspect, h, 1);
      x.label.sprite.position.copy(x.arc.apex).add(_b.set(0, 0.14 + Math.sin(t * 1.7 + x.slot) * 0.04, 0));

      const show = clamp((x.age - ARC_GROW * 0.8) / 0.35, 0, 1);
      x.drawn = 0; // arrow scale as drawn (labelObstacles reads it)
      if (show <= 0) continue;
      const nudge = Math.sin(t * 3.2 + x.slot) * 0.06;
      _w.copy(x.end).addScaledVector(x.dir, nudge);
      _w.y += 0.08;
      x.drawn = x.arrowScale * easeOutBack(show);
      (x.tail ??= new THREE.Vector3()).copy(_w);
      arrows.set(x.slot, _w, x.yaw, x.drawn);
    }
  }

  // --- tier pulse ----------------------------------------------------------------

  // Marks a guessed tile until clear(): a tint plus a solid hexagon outline in
  // the tier colour (the outline stays readable on a zone of a similar hue).
  function markTile(tileId, tier) {
    const color = TIER_COLORS[tier];
    if (!color || !board.setTint(tileId, color)) return false;
    const old = marked.findIndex((m) => m.tileId === tileId);
    if (old >= 0) marked.splice(old, 1);
    marked.push({ tileId, color });
    return true;
  }

  // markTile, plus three glowing hexagon rings rippling out from the tile.
  function tierPulse(tileId, tier) {
    if (!markTile(tileId, tier)) return false;
    rings.spawn({ anchor: (out) => tileLocal(tileId, out), color: TIER_COLORS[tier], radius: tileRadius() });
    return true;
  }

  const markItems = [];
  function stepMarks() {
    markItems.length = 0;
    for (const m of marked) {
      const p = tileLocal(m.tileId, new THREE.Vector3());
      if (p) markItems.push({ p, radius: tileRadius(), color: m.color });
    }
    marks.draw(markItems);
  }

  // --- victory -------------------------------------------------------------------

  // Confetti over the solved tile and the storyteller, the storyteller's
  // celebration, and a gentle camera push toward the tile. A phone can't hold
  // the tile and the storyteller in one frame, so it frames the reveal instead.
  function victory({ tileId, player = getPlayer() } = {}) {
    const style = normaliseStyle(player?.style);
    const colors = [style.primaryColor, style.secondaryColor, ...CONFETTI_GOLD];
    const at = tileId ? tileLocal(tileId, new THREE.Vector3()) : null;
    const rng = createRng(`roots3d:fx:confetti:${seq++}`);

    if (at) confetti.spawn(rng, 150, confettiParticle(at, colors, { ring: 0.15, lift: 0.3, out: [0.5, 2.1], up: [4.2, 6.4], life: [3.2, 4.4] }));
    // A second, smaller shower over the storyteller's pedestal.
    storytellerAnchor.updateWorldMatrix(true, false);
    const st = islandAnchor.worldToLocal(storytellerAnchor.localToWorld(new THREE.Vector3(0, 2.7, 0)));
    confetti.spawn(rng, 60, confettiParticle(st, colors, { ring: 0, lift: 0, out: [0.3, 1.2], up: [2.2, 3.6], life: [2.8, 3.8] }));

    storyteller?.celebrate();

    if (camera.aspect < 1) {
      const { offset, distance, yaw, pitch } = PORTRAIT_WIN;
      storytellerAnchor.getWorldPosition(_w).add(_b.set(...offset));
      rig.setGoal({ target: _w, distance, yaw, pitch });
    } else if (tileId && board.getTileWorldPosition(tileId, _w, { rest: true })) {
      islandAnchor.updateWorldMatrix(true, false);
      const centre = islandAnchor.localToWorld(new THREE.Vector3(0, 0, 0.4));
      rig.setGoal({ target: centre.lerp(_w, 0.45), distance: rig.homeDistance * 0.8 });
    }
    return true;
  }

  // --- the whole guess sequence ------------------------------------------------------

  // result: a game.js guess result { id, tier, distanceKm, bearing }.
  // Flies to the tile, plants the flag, pulses the tier, then either draws the
  // trajectory arc (wrong) or plays the victory (green), and flies home.
  // onLand runs at touchdown; onDone once the explorer is back on its pedestal.
  // hold overrides the seconds spent on the tile (the capture showcase paces it).
  // Returns false (and does nothing) while a sequence is still playing.
  function playGuess(result, player = getPlayer(), { onLand, onDone, hold = null } = {}) {
    if (busy || !result?.id) return false;
    const ok = flyAvatarTo(result.id, {
      onLand: () => {
        plantFlag(result.id, player);
        tierPulse(result.id, result.tier);
        const won = result.tier === 'green';
        after(EFFECT_DELAY, () => {
          if (won) victory({ tileId: result.id, player });
          else trajectoryArc(result.id, result, result.tier, player);
        });
        after(hold ?? (won ? HOLD.win : HOLD.miss), () => {
          if (!flyHome({ onLand: finish })) finish();
        });
        onLand?.(result);
      },
    });
    if (!ok) return false;
    busy = true;
    function finish() {
      busy = false;
      onDone?.(result);
    }
    return true;
  }

  // --- sim step ----------------------------------------------------------------------

  // Runs inside the fixed sim step, after the avatar's idle tick.
  function update(dt, t) {
    clock += dt;
    if (timers.length) {
      const due = timers.filter((x) => x.at <= clock + 1e-9);
      timers = timers.filter((x) => x.at > clock + 1e-9);
      for (const x of due) x.fn();
    }
    stepFlight(dt);
    applyPose(getAvatar());
    stepFlags(dt, t);
    stepArcs(dt, t);
    if (marked.length || marks.mesh.visible) stepMarks();
    rings.update(dt);
    dust.update(dt, t);
    confetti.update(dt, t);
  }

  // Removes everything a run left behind and sends the explorer home at once.
  function clear() {
    for (const f of flags) disposeObject(f.group);
    flags.length = 0;
    while (arcs.length) removeArc(arcs[arcs.length - 1]);
    arrows.clear();
    rings.clear();
    dust.clear();
    confetti.clear();
    marked.length = 0;
    marks.clear();
    board.clearTints();
    timers = [];
    busy = false;
    snapHome();
    applyPose(getAvatar());
  }

  // Back to the t = 0 state (capture replays from 0).
  function reset() {
    clear();
    clock = 0;
    seq = 0;
  }

  function dispose() {
    clear();
    rings.dispose();
    arrows.dispose();
    marks.dispose();
    for (const m of [dust.mesh, confetti.mesh]) m.dispose();
    dustGeo.dispose();
    dustMat.dispose();
    confettiGeo.dispose();
    confettiMat.dispose();
    root.removeFromParent();
  }

  // Capsules the board's region labels keep clear of (see board-labels.js).
  const labelObstacles = createLabelObstacles({ getAvatar, root, arcs, capacity: 1 + 2 * MAX_ARCS });

  return {
    flyAvatarTo,
    flyHome,
    plantFlag,
    trajectoryArc,
    tierPulse,
    markTile,
    setViewport(w, h) {
      viewportH = Math.max(1, h);
    },
    victory,
    playGuess,
    clear,
    reset,
    update,
    dispose,
    // A guess sequence is playing (the UI should wait before the next guess).
    get busy() {
      return busy;
    },
    get flying() {
      return flight !== null;
    },
    // Tile the explorer is standing on, or null.
    get perch() {
      return perch;
    },
    get counts() {
      return { flags: flags.length, arcs: arcs.length, dust: dust.alive, confetti: confetti.alive, timers: timers.length };
    },
    labelObstacles,
  };

}
