// Small geometry and maths helpers shared by scene, avatar and storyteller code.
// three.js r160 ships BufferGeometryUtils only as an addon, so the merge we need
// is written here (CLAUDE.md §1).

import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// Bakes a transform into a geometry in place and returns it.
export function place(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx } = {}) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

// Gives every vertex of a geometry one colour (for multi-colour merged meshes
// drawn with a vertexColors material). Returns the geometry.
export function paint(geo, color) {
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Merges geometries into one non-indexed geometry. Keeps position and normal,
// plus uv / color only when every input has them. Inputs are disposed.
export function mergeGeometries(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal', 'uv', 'color'].filter((n) => parts.every((g) => g.attributes[n]));
  const merged = new THREE.BufferGeometry();
  for (const name of names) {
    const itemSize = parts[0].attributes[name].itemSize;
    const total = parts.reduce((sum, g) => sum + g.attributes[name].count * itemSize, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const g of parts) {
      const src = g.attributes[name].array;
      out.set(src, offset);
      offset += src.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(out, itemSize));
  }
  if (!merged.attributes.normal) merged.computeVertexNormals();
  for (const g of geos) g.dispose();
  for (const g of parts) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

// Moves vertices by a deterministic random offset. Vertices sharing a position
// move together, so the surface stays closed. filter(x, y, z) can pin vertices.
export function jitter(geo, rng, amount, filter = null) {
  const pos = geo.attributes.position;
  const offsets = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (filter && !filter(x, y, z)) continue;
    // Rounded integer key: also folds -0 into 0, so lathe seams stay welded.
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let o = offsets.get(key);
    if (!o) {
      o = [(rng() * 2 - 1) * amount, (rng() * 2 - 1) * amount, (rng() * 2 - 1) * amount];
      offsets.set(key, o);
    }
    pos.setXYZ(i, x + o[0], y + o[1], z + o[2]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Marks geometry/material/texture as shared so disposeObject() leaves it alone.
export function shared(resource) {
  resource.userData.shared = true;
  return resource;
}

function disposeMaterial(mat) {
  if (!mat || mat.userData.shared) return;
  for (const key of ['map', 'emissiveMap', 'alphaMap', 'roughnessMap']) {
    const tex = mat[key];
    if (tex && !tex.userData.shared) tex.dispose();
  }
  mat.dispose();
}

// Disposes everything under root that isn't marked shared, and detaches root.
export function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose();
    if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial);
    else disposeMaterial(obj.material);
  });
  root.removeFromParent();
}

// ---------------------------------------------------------------------------
// Maths
// ---------------------------------------------------------------------------

// Frame-rate independent exponential approach (used only inside sim steps).
export function damp(current, goal, lambda, dt) {
  return current + (goal - current) * (1 - Math.exp(-lambda * dt));
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// Darkens (amount < 0) or lightens (amount > 0) a hex colour; returns a THREE.Color.
export function shade(hex, amount) {
  const c = new THREE.Color(hex);
  const target = amount < 0 ? new THREE.Color(0, 0, 0) : new THREE.Color(1, 1, 1);
  return c.lerp(target, Math.abs(amount));
}
