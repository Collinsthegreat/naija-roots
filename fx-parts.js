// Building blocks for fx.js: instanced particle pools (dust, confetti), tier
// pulse rings, bearing arrows, glowing trajectory tubes and distance labels.
// Every pool is one InstancedMesh with a fixed capacity; dead slots are drawn
// at zero scale. All motion advances in update(dt), inside the sim step, and
// every random number comes from a seeded PRNG passed in by the caller.

import * as THREE from 'three';
import { randRange, pick } from './rng.js';
import { place, mergeGeometries, smoothstep } from './geom.js';

// Feedback tier colours (match --fb-* in index.html).
export const TIER_COLORS = Object.freeze({
  green: '#3f9b5a',
  cyan: '#2fa7b5',
  yellow: '#e2b33c',
  red: '#cf5340',
});

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// ---------------------------------------------------------------------------
// Particle pool
// ---------------------------------------------------------------------------

// physics: { gravity, drag, terminal (max fall speed, or Infinity), flutter
// (sideways sway), fadeOut (seconds of shrinking at the end of life) }
export function createParticles(name, geometry, material, capacity, physics) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.frustumCulled = false; // particles fly far from where they spawned
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < capacity; i++) {
    mesh.setMatrixAt(i, ZERO);
    mesh.setColorAt(i, _c.set('#ffffff'));
  }

  const pos = new Float32Array(capacity * 3);
  const vel = new Float32Array(capacity * 3);
  const axis = new Float32Array(capacity * 3);
  const age = new Float32Array(capacity);
  const life = new Float32Array(capacity); // 0 = free slot
  const size = new Float32Array(capacity);
  const spin = new Float32Array(capacity);
  const phase = new Float32Array(capacity);
  let cursor = 0;
  let alive = 0;

  // Spawns `count` particles. init(rng) returns { p: [x,y,z], v: [x,y,z],
  // life, size, spin, color }. Slots are reused in a fixed round-robin order.
  function spawn(rng, count, init) {
    for (let n = 0; n < count; n++) {
      const i = cursor;
      cursor = (cursor + 1) % capacity;
      const o = init(rng, n);
      pos.set(o.p, i * 3);
      vel.set(o.v, i * 3);
      _axis.set(randRange(rng, -1, 1), randRange(rng, -1, 1), randRange(rng, -1, 1));
      if (_axis.lengthSq() < 1e-6) _axis.set(0, 1, 0);
      _axis.normalize();
      axis[i * 3] = _axis.x;
      axis[i * 3 + 1] = _axis.y;
      axis[i * 3 + 2] = _axis.z;
      age[i] = 0;
      life[i] = o.life;
      size[i] = o.size;
      spin[i] = o.spin ?? 0;
      phase[i] = randRange(rng, 0, Math.PI * 2);
      mesh.setColorAt(i, _c.set(o.color));
    }
    mesh.instanceColor.needsUpdate = true;
    mesh.visible = true;
  }

  function update(dt, t) {
    alive = 0;
    const dragK = Math.exp(-physics.drag * dt);
    for (let i = 0; i < capacity; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      if (age[i] >= life[i]) {
        life[i] = 0;
        mesh.setMatrixAt(i, ZERO);
        continue;
      }
      alive++;
      const k = i * 3;
      vel[k + 1] -= physics.gravity * dt;
      vel[k] *= dragK;
      vel[k + 1] *= dragK;
      vel[k + 2] *= dragK;
      if (vel[k + 1] < -physics.terminal) vel[k + 1] = -physics.terminal;
      const sway = physics.flutter ? Math.sin(t * 3.1 + phase[i]) * physics.flutter : 0;
      pos[k] += (vel[k] + sway) * dt;
      pos[k + 1] += vel[k + 1] * dt;
      pos[k + 2] += (vel[k + 2] + sway * 0.6) * dt;

      const fade = 1 - smoothstep((age[i] - (life[i] - physics.fadeOut)) / physics.fadeOut);
      const grow = smoothstep(age[i] / 0.08);
      const sc = size[i] * fade * grow;
      _axis.set(axis[k], axis[k + 1], axis[k + 2]);
      _q.setFromAxisAngle(_axis, spin[i] * age[i] + phase[i]);
      _m.compose(_p.set(pos[k], pos[k + 1], pos[k + 2]), _q, _s.set(sc, sc, sc));
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = alive > 0; // an empty pool costs no draw call
  }

  // Empties the pool and restores every slot to its first state (so a capture
  // replay after reset starts from identical buffers).
  function clear() {
    life.fill(0);
    cursor = 0;
    alive = 0;
    for (let i = 0; i < capacity; i++) {
      mesh.setMatrixAt(i, ZERO);
      mesh.setColorAt(i, _c.set('#ffffff'));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.visible = false;
  }

  mesh.visible = false;
  return {
    mesh,
    spawn,
    update,
    clear,
    get alive() {
      return alive;
    },
  };
}

// ---------------------------------------------------------------------------
// Tier pulse rings: hexagon outlines that expand from a tile and fade
// ---------------------------------------------------------------------------

export function createPulseRings(capacity) {
  const geo = new THREE.RingGeometry(0.86, 1.0, 6, 1, Math.PI / 6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending, // black = invisible, so fading = darkening
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.name = 'fx-pulses';
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  for (let i = 0; i < capacity; i++) {
    mesh.setMatrixAt(i, ZERO);
    mesh.setColorAt(i, _c.set('#000000'));
  }

  const rings = []; // { slot, delay, age, duration, from, to, color, anchor(out) }
  let cursor = 0;

  // anchor(out) writes the ring centre (island-anchor space) or returns null.
  function spawn({ anchor, color, radius, count = 3, gap = 0.22, duration = 1.1 }) {
    for (let n = 0; n < count; n++) {
      const slot = cursor;
      cursor = (cursor + 1) % capacity;
      const old = rings.findIndex((r) => r.slot === slot);
      if (old >= 0) rings.splice(old, 1);
      rings.push({ slot, delay: n * gap, age: 0, duration, from: radius * 0.95, to: radius * 2.1, color: new THREE.Color(color), anchor });
    }
    mesh.visible = true;
  }

  function update(dt) {
    for (let k = rings.length - 1; k >= 0; k--) {
      const r = rings[k];
      r.age += dt;
      const a = (r.age - r.delay) / r.duration;
      if (a >= 1) {
        mesh.setMatrixAt(r.slot, ZERO);
        rings.splice(k, 1);
        continue;
      }
      if (a < 0 || !r.anchor(_p)) {
        mesh.setMatrixAt(r.slot, ZERO);
        continue;
      }
      const e = 1 - (1 - a) ** 3;
      const sc = r.from + (r.to - r.from) * e;
      _p.y += 0.02;
      _m.compose(_p, _q.identity(), _s.set(sc, 1, sc));
      mesh.setMatrixAt(r.slot, _m);
      mesh.setColorAt(r.slot, _c.copy(r.color).multiplyScalar(1.4 * (1 - a) * smoothstep(a / 0.08)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.visible = rings.length > 0;
  }

  function clear() {
    rings.length = 0;
    cursor = 0;
    for (let i = 0; i < capacity; i++) {
      mesh.setMatrixAt(i, ZERO);
      mesh.setColorAt(i, _c.set('#000000'));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.visible = false;
  }

  mesh.visible = false;
  return {
    mesh,
    spawn,
    update,
    clear,
    dispose() {
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Bearing arrows: one InstancedMesh, one slot per wrong guess
// ---------------------------------------------------------------------------

// The arrow points along +z, lying flat, with its tail at the origin. `pad`
// grows every part evenly: the outline shell is the same arrow, padded.
function arrowGeometry(pad = 0) {
  const shaft = place(new THREE.CylinderGeometry(0.065 + pad, 0.065 + pad, 0.34 + 2 * pad, 8), { rx: Math.PI / 2, z: 0.17 });
  const head = place(new THREE.ConeGeometry(0.16 + 1.6 * pad, 0.28 + 2.4 * pad, 10), { rx: Math.PI / 2, z: 0.48 });
  const ring = place(new THREE.TorusGeometry(0.075, 0.024 + pad, 6, 14), { rx: Math.PI / 2 });
  return mergeGeometries([shaft, head, ring]);
}

const ARROW_OUTLINE = 0.03; // outline thickness, in arrow units
const ARROW_INK = '#2b2118'; // the HUD's ink colour: reads on every tile colour

// The arrows (tier colour, no white wash) plus a dark outline shell drawn
// back-face only: the inverted-hull outline, so an arrow reads on light tiles.
// Both share every instance transform. `mesh` is the group holding the two.
export function createArrows(capacity) {
  const geo = arrowGeometry();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });
  const arrows = new THREE.InstancedMesh(geo, mat, capacity);
  arrows.frustumCulled = false;
  arrows.castShadow = true;
  const shellGeo = arrowGeometry(ARROW_OUTLINE);
  const shellMat = new THREE.MeshBasicMaterial({ color: ARROW_INK, side: THREE.BackSide });
  const shell = new THREE.InstancedMesh(shellGeo, shellMat, capacity);
  shell.frustumCulled = false;
  const both = [arrows, shell];
  for (let i = 0; i < capacity; i++) {
    for (const m of both) m.setMatrixAt(i, ZERO);
    arrows.setColorAt(i, _c.set('#ffffff'));
  }
  const group = new THREE.Group();
  group.name = 'fx-arrows';
  group.add(shell, arrows);
  const shown = new Set(); // slots drawn at a non-zero scale
  group.visible = false;

  function setMatrix(i, matrix) {
    for (const m of both) {
      m.setMatrixAt(i, matrix);
      m.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    mesh: group,
    // Places slot i at `p` (island-anchor space), turned to `yaw`, at `scale`.
    set(i, p, yaw, scale, color) {
      _q.setFromAxisAngle(_axis.set(0, 1, 0), yaw);
      setMatrix(i, _m.compose(p, _q, _s.set(scale, scale, scale)));
      if (color) {
        arrows.setColorAt(i, _c.set(color));
        arrows.instanceColor.needsUpdate = true;
      }
      if (scale > 0) shown.add(i);
      else shown.delete(i);
      group.visible = shown.size > 0;
    },
    hide(i) {
      setMatrix(i, ZERO);
      shown.delete(i);
      group.visible = shown.size > 0;
    },
    clear() {
      for (let i = 0; i < capacity; i++) {
        setMatrix(i, ZERO);
        arrows.setColorAt(i, _c.set('#ffffff'));
      }
      arrows.instanceColor.needsUpdate = true;
      shown.clear();
      group.visible = false;
    },
    dispose() {
      for (const m of both) m.dispose();
      geo.dispose();
      mat.dispose();
      shellGeo.dispose();
      shellMat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Trajectory arc: a glowing tube that grows from start to end
// ---------------------------------------------------------------------------

const ARC_SEGMENTS = 64;
const ARC_RADIAL = 8;

// start, end: Vector3 (island-anchor space); height: apex lift above the
// higher end. Returns { group, apex, tangentEnd, setProgress(p), dispose }.
export function createArc(start, end, height, color) {
  const mid = start.clone().lerp(end, 0.5);
  mid.y = Math.max(start.y, end.y) + height * 2; // control point: apex sits ~halfway up
  const curve = new THREE.QuadraticBezierCurve3(start.clone(), mid, end.clone());

  const coreGeo = new THREE.TubeGeometry(curve, ARC_SEGMENTS, 0.035, ARC_RADIAL, false);
  const haloGeo = new THREE.TubeGeometry(curve, ARC_SEGMENTS, 0.095, ARC_RADIAL, false);
  const coreMat = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
  const haloMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  const halo = new THREE.Mesh(haloGeo, haloMat);
  core.name = 'fx-arc';
  halo.name = 'fx-arc-glow';
  halo.renderOrder = 4;
  const group = new THREE.Group();
  group.add(core, halo);

  const perSegment = ARC_RADIAL * 6; // indices per tube segment
  function setProgress(p) {
    const n = Math.round(Math.min(1, Math.max(0, p)) * ARC_SEGMENTS) * perSegment;
    coreGeo.setDrawRange(0, n);
    haloGeo.setDrawRange(0, n);
    group.visible = n > 0;
  }
  setProgress(0);

  return {
    group,
    apex: curve.getPoint(0.5),
    pointAt: (u, out) => curve.getPoint(u, out),
    setProgress,
    setGlow(k) {
      haloMat.opacity = 0.32 * k;
    },
    dispose() {
      coreGeo.dispose();
      haloGeo.dispose();
      coreMat.dispose();
      haloMat.dispose();
      group.removeFromParent();
    },
  };
}

// ---------------------------------------------------------------------------
// Tier marks: a solid hexagon outline in the tier colour on every guessed
// tile. Colour tints alone can vanish on a zone of a similar hue (a YELLOW
// result on a gold tile), so the outline carries the feedback.
// ---------------------------------------------------------------------------

export function createTierMarks(capacity) {
  const geo = new THREE.RingGeometry(0.8, 0.97, 6, 1, Math.PI / 6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.name = 'fx-marks';
  mesh.frustumCulled = false;
  mesh.count = 0;
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, _c.set('#ffffff'));
  mesh.visible = false;
  return {
    mesh,
    // items: [{ p: Vector3 (tile top, island space), radius, color }]
    draw(items) {
      const n = Math.min(items.length, capacity);
      for (let i = 0; i < n; i++) {
        const it = items[i];
        _m.compose(_p.copy(it.p).setY(it.p.y + 0.012), _q.identity(), _s.set(it.radius, 1, it.radius));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, _c.set(it.color));
      }
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
    // Every slot back to its first state (a capture replay starts identical).
    clear() {
      for (let i = 0; i < capacity; i++) {
        mesh.setMatrixAt(i, ZERO);
        mesh.setColorAt(i, _c.set('#ffffff'));
      }
      mesh.count = 0;
      mesh.visible = false;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Distance label: "533 km · NE" on a pill, as a floating sprite
// ---------------------------------------------------------------------------

export function createDistanceLabel(text, tierColor) {
  const W = 512;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255, 250, 241, 0.96)';
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(6, 6, W - 12, H - 12, (H - 12) / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tierColor;
  ctx.beginPath();
  ctx.arc(64, H / 2, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2118';
  ctx.font = '700 54px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2 + 24, H / 2 + 3, W - 140);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  // sizeAttenuation off: fx.js sizes it in screen pixels, readable on phones too.
  const mat = new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'fx-distance-label';
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 30;
  return {
    sprite,
    aspect: W / H,
    dispose() {
      map.dispose();
      mat.dispose();
      sprite.removeFromParent();
    },
  };
}

// Spawn recipes for createParticles().spawn: each returns init(rng) → particle.
// A dust puff at `origin`, sized by `scale`.
export function dustParticle(origin, scale, colors) {
  return (r) => {
    const a = randRange(r, 0, Math.PI * 2);
    const speed = randRange(r, 0.7, 1.5) * scale;
    return {
      p: [origin.x + Math.cos(a) * 0.05 * scale, origin.y + 0.03, origin.z + Math.sin(a) * 0.05 * scale],
      v: [Math.cos(a) * speed, randRange(r, 0.35, 0.9) * scale, Math.sin(a) * speed],
      life: randRange(r, 0.55, 0.85),
      size: randRange(r, 0.04, 0.07) * scale,
      spin: randRange(r, 1, 4),
      color: pick(r, colors),
    };
  };
}

// A confetti burst from `at`: o = { ring, lift, out: [min, max], up: [min, max], life: [min, max] }.
export function confettiParticle(at, colors, o) {
  return (r) => {
    const a = randRange(r, 0, Math.PI * 2);
    const out = randRange(r, o.out[0], o.out[1]);
    return {
      p: [at.x + Math.cos(a) * o.ring, at.y + o.lift, at.z + Math.sin(a) * o.ring],
      v: [Math.cos(a) * out, randRange(r, o.up[0], o.up[1]), Math.sin(a) * out],
      life: randRange(r, o.life[0], o.life[1]),
      size: randRange(r, 0.08, 0.12),
      spin: randRange(r, 4, 9),
      color: pick(r, colors),
    };
  };
}

// Shared geometries for dust puffs and confetti chips.
export function dustGeometry() {
  return new THREE.IcosahedronGeometry(1, 0);
}

export function confettiGeometry() {
  return new THREE.PlaneGeometry(1, 0.62);
}

// ---------------------------------------------------------------------------
// Small maths helpers
// ---------------------------------------------------------------------------

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// 12345 → "12,345" (not toLocaleString: the output must not depend on locale).
export function groupDigits(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Unit vector on the board for a compass point: north is −z, east is +x.
export function compassDir(bearing, out = new THREE.Vector3()) {
  const i = COMPASS.indexOf(bearing);
  if (i < 0) return null;
  const a = (i * Math.PI) / 4;
  return out.set(Math.sin(a), 0, -Math.cos(a));
}

// Shortest signed angle from a to b.
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function bezier(p0, p1, p2, p3, u, out) {
  const v = 1 - u;
  return out.set(0, 0, 0)
    .addScaledVector(p0, v * v * v)
    .addScaledVector(p1, 3 * v * v * u)
    .addScaledVector(p2, 3 * v * u * u)
    .addScaledVector(p3, u * u * u);
}

export function bezierTangent(p0, p1, p2, p3, u, out) {
  const v = 1 - u;
  return out.set(0, 0, 0)
    .addScaledVector(p1.clone().sub(p0), 3 * v * v)
    .addScaledVector(p2.clone().sub(p1), 6 * v * u)
    .addScaledVector(p3.clone().sub(p2), 3 * u * u);
}

export const easeOutBack = (x) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;

// ---------------------------------------------------------------------------
// Label obstacles: world-space capsules { a, b, radius } the board's region
// labels must not cover (see board-labels.js): the explorer, feet to drone,
// wherever it is, and every bearing arrow showing. A fixed pool, refilled on
// each call, so nothing is allocated per sim step.
// ---------------------------------------------------------------------------

// arcs: fx's live arc list; each shown arrow has tail (root space), dir and
// drawn (its scale, 0 while hidden); each km label has its sprite and labelPx.
// Capsules { a, b, radius } are world space; a km label is a box { at, wPx,
// hPx }: anchored bottom-centre at world point `at`, sized in CSS px.
export function createLabelObstacles({ getAvatar, root, arcs, capacity }) {
  const pool = Array.from({ length: capacity }, () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), radius: 0, at: null, wPx: 0, hPx: 0 }));
  const boxes = Array.from({ length: capacity }, () => new THREE.Vector3());
  return function labelObstacles() {
    let n = 0;
    const avatar = getAvatar();
    if (avatar) {
      avatar.updateWorldMatrix(true, false);
      const o = pool[n++];
      avatar.localToWorld(o.a.set(0, 0.15, 0));
      avatar.localToWorld(o.b.set(0, 2.05, 0));
      o.radius = 0.42 * avatar.getWorldScale(_s).x;
      o.at = null;
    }
    root.updateWorldMatrix(true, false);
    for (const x of arcs) {
      if (!x.drawn || n >= pool.length) continue;
      const o = pool[n++];
      root.localToWorld(o.a.copy(x.tail));
      root.localToWorld(o.b.copy(x.tail).addScaledVector(x.dir, 0.62 * x.drawn));
      o.radius = 0.21 * x.drawn;
      o.at = null;
    }
    for (const x of arcs) {
      if (!x.label.sprite.visible || !x.labelPx || n >= pool.length) continue;
      const o = pool[n];
      o.at = root.localToWorld(boxes[n++].copy(x.label.sprite.position));
      o.hPx = x.labelPx;
      o.wPx = x.labelPx * x.label.aspect;
    }
    return pool.slice(0, n);
  };
}
