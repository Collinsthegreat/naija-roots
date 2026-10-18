// The warm, sunlit tabletop diorama: wooden table, shallow water basin, floating
// island, drifting clouds, two stone pedestals and the lighting.
// Everything animates from sim time t inside update(); nothing reads the clock.

import * as THREE from 'three';
import { createRng, randRange } from './rng.js';
import { place, paint, mergeGeometries, jitter, smoothstep } from './geom.js';
import { createWoodTexture } from './textures.js';

// World layout (units are roughly metres at diorama scale). Other modules read
// these instead of hard-coding positions.
export const LAYOUT = Object.freeze({
  tableRadius: 15,
  basinInner: 10.2,
  basinOuter: 11.2,
  waterLevel: 0.22,
  islandRadius: 5.6,
  islandTop: 1.7,
  islandDepth: 1.25,
  pedestalX: 8.0,
  pedestalZ: 1.0,
  pedestalTop: 1.82,
});

const SKY_COLOR = '#f5e6cc';

const PALETTE = {
  grass: '#93b964',
  grassEdge: '#7fa653',
  sand: '#e6c993',
  soil: '#b47c4c',
  rock: '#9d8569',
  rockDark: '#857056',
  stone: '#d2c2a2',
  stoneDark: '#b9a888',
  rim: '#cfbd9b',
  waterDeep: '#4aa7b5',
  waterShallow: '#93d6cf',
  lily: '#6f9d50',
  cloud: '#fffaf2',
};

// The same wave as the water vertex shader, so floating things bob in step with it.
function waveHeight(x, z, t) {
  return (
    Math.sin(x * 0.8 + t * 1.1) * 0.05 +
    Math.sin(z * 1.1 - t * 0.9) * 0.04 +
    Math.sin((x + z) * 1.9 + t * 1.6) * 0.015
  );
}

const WAVE_GLSL = /* glsl */ `
uniform float uTime;
float rootsWave(vec2 p, float t) {
  return sin(p.x * 0.8 + t * 1.1) * 0.05
       + sin(p.y * 1.1 - t * 0.9) * 0.04
       + sin((p.x + p.y) * 1.9 + t * 1.6) * 0.015;
}
`;

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

function createLights(group) {
  // Generous sky fill + a warm sun: shadows stay soft and readable, never black.
  const hemi = new THREE.HemisphereLight('#fff3df', '#c9a27a', 1.35);
  group.add(hemi);

  // The one and only shadow-casting light (CLAUDE.md §2).
  const sun = new THREE.DirectionalLight('#ffe0b0', 2.4);
  sun.position.set(9, 16, 7);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const cam = sun.shadow.camera;
  cam.left = -13;
  cam.right = 13;
  cam.top = 13;
  cam.bottom = -13;
  cam.near = 2;
  cam.far = 45;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);
  return { hemi, sun };
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function createTable(group, owned) {
  const { tableRadius } = LAYOUT;
  const wood = createWoodTexture('roots3d:table');
  const topMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.82, metalness: 0 });
  const sideMat = new THREE.MeshStandardMaterial({ color: '#a8764a', roughness: 0.85 });
  const geo = new THREE.CylinderGeometry(tableRadius, tableRadius - 0.15, 1, 72, 1);
  const table = new THREE.Mesh(geo, [sideMat, topMat, sideMat]);
  table.position.y = -0.5;
  table.receiveShadow = true;
  group.add(table);

  // A soft rounded lip around the table edge.
  const lipGeo = new THREE.TorusGeometry(tableRadius - 0.02, 0.09, 6, 96);
  lipGeo.rotateX(Math.PI / 2);
  const lip = new THREE.Mesh(lipGeo, sideMat);
  lip.position.y = -0.02;
  lip.receiveShadow = true;
  group.add(lip);

  owned.push(geo, lipGeo, topMat, sideMat, wood);
}

// ---------------------------------------------------------------------------
// Water basin
// ---------------------------------------------------------------------------

function createBasin(group, owned, uniforms) {
  const { basinInner, basinOuter, waterLevel } = LAYOUT;

  // Polar grid so the waves have vertices everywhere.
  const waterGeo = new THREE.RingGeometry(0.01, basinInner + 0.1, 64, 16);
  waterGeo.rotateX(-Math.PI / 2);
  const pos = waterGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const deep = new THREE.Color(PALETTE.waterDeep);
  const shallow = new THREE.Color(PALETTE.waterShallow);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    // Shallow and bright near the island and the rim, deeper between.
    const nearIsland = 1 - smoothstep((r - LAYOUT.islandRadius) / 1.6);
    const nearRim = smoothstep((r - (basinInner - 2.2)) / 2.2);
    c.copy(deep).lerp(shallow, Math.max(nearIsland * 0.8, nearRim * 0.9));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  waterGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const waterMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0,
    flatShading: true,
  });
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WAVE_GLSL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed.y += rootsWave(position.xz, uTime);');
  };
  waterMat.customProgramCacheKey = () => 'roots3d-water';

  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = waterLevel;
  water.receiveShadow = true;
  group.add(water);

  // Sandstone rim that holds the water.
  const rimProfile = [
    new THREE.Vector2(basinInner, -0.05),
    new THREE.Vector2(basinInner - 0.05, 0.34),
    new THREE.Vector2(basinInner + 0.15, 0.5),
    new THREE.Vector2(basinOuter - 0.3, 0.52),
    new THREE.Vector2(basinOuter - 0.05, 0.34),
    new THREE.Vector2(basinOuter, -0.05),
  ];
  const rimGeo = new THREE.LatheGeometry(rimProfile, 72);
  const rimMat = new THREE.MeshStandardMaterial({ color: PALETTE.rim, roughness: 0.92, flatShading: true, side: THREE.DoubleSide });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.castShadow = true;
  rim.receiveShadow = true;
  group.add(rim);

  owned.push(waterGeo, waterMat, rimGeo, rimMat);
}

// ---------------------------------------------------------------------------
// Floating island (the board sits on its flat top, added later)
// ---------------------------------------------------------------------------

function lathePart(points, color, segments = 40) {
  const geo = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  return paint(geo, color);
}

function createIsland(group, owned) {
  const geo = mergeGeometries([
    lathePart([[0, 0], [5.25, 0]], PALETTE.grass),
    lathePart([[5.25, 0], [5.48, -0.05], [5.6, -0.15], [5.56, -0.26]], PALETTE.grassEdge),
    lathePart([[5.56, -0.26], [5.42, -0.38], [5.38, -0.5]], PALETTE.sand),
    lathePart([[5.38, -0.5], [5.2, -0.66], [4.85, -0.78]], PALETTE.soil),
    lathePart([[4.85, -0.78], [4.1, -0.95], [3.1, -1.1], [1.8, -1.2], [0, -1.25]], PALETTE.rock),
  ]);
  // Rough up the rocky underside only; the grass top stays perfectly flat.
  jitter(geo, createRng('roots3d:island'), 0.12, (x, y) => y < -0.8);

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  const island = new THREE.Group();
  island.name = 'island';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  island.add(mesh);

  const anchor = new THREE.Group(); // top surface, y = 0 in island space
  anchor.name = 'islandAnchor';
  island.add(anchor);

  island.position.y = LAYOUT.islandTop;
  group.add(island);
  owned.push(geo, mat);
  return { island, anchor };
}

// ---------------------------------------------------------------------------
// Pedestals: left = player, right = storyteller
// ---------------------------------------------------------------------------

function createPedestals(group, owned) {
  const { pedestalX, pedestalZ, pedestalTop } = LAYOUT;
  const geo = mergeGeometries([
    paint(place(new THREE.CylinderGeometry(1.15, 1.3, 0.7, 10), { y: 0.35 }), PALETTE.stoneDark),
    paint(place(new THREE.CylinderGeometry(0.78, 0.88, 0.9, 10), { y: 1.15 }), PALETTE.stone),
    paint(place(new THREE.CylinderGeometry(1.05, 0.98, 0.22, 10), { y: 1.71 }), PALETTE.stone),
  ]);
  jitter(geo, createRng('roots3d:pedestal'), 0.025, (x, y) => y < pedestalTop - 0.02);

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true });
  const stones = new THREE.InstancedMesh(geo, mat, 2);
  stones.castShadow = true;
  stones.receiveShadow = true;

  const ringGeo = new THREE.TorusGeometry(1.07, 0.055, 8, 56);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, 2);

  const m = new THREE.Matrix4();
  const sides = [
    { key: 'player', x: -pedestalX, yaw: 0.55, ring: '#e0913f' },
    { key: 'storyteller', x: pedestalX, yaw: -0.55, ring: '#e2b33c' },
  ];
  const result = {};
  sides.forEach((side, i) => {
    m.makeRotationY(side.yaw * 0.3);
    m.setPosition(side.x, 0, pedestalZ);
    stones.setMatrixAt(i, m);
    m.makeTranslation(side.x, pedestalTop - 0.08, pedestalZ);
    rings.setMatrixAt(i, m);
    rings.setColorAt(i, new THREE.Color(side.ring));

    const anchor = new THREE.Group();
    anchor.name = `${side.key}Pedestal`;
    anchor.position.set(side.x, pedestalTop, pedestalZ);
    anchor.rotation.y = side.yaw; // faces the camera and the island
    group.add(anchor);

    result[side.key] = {
      anchor,
      setRingColor(hex) {
        rings.setColorAt(i, new THREE.Color(hex));
        rings.instanceColor.needsUpdate = true;
      },
    };
  });

  group.add(stones, rings);
  owned.push(geo, mat, ringGeo, ringMat);
  return result;
}

// ---------------------------------------------------------------------------
// Rocks, lily pads and foam (all instanced)
// ---------------------------------------------------------------------------

function createRocks(group, owned) {
  const rng = createRng('roots3d:rocks');
  const geo = jitter(new THREE.DodecahedronGeometry(0.32, 0), rng, 0.07);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
  const count = 22;
  const rocks = new THREE.InstancedMesh(geo, mat, count);
  rocks.castShadow = true;
  rocks.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const tones = [PALETTE.rock, PALETTE.rockDark, PALETTE.stoneDark, PALETTE.rim];
  for (let i = 0; i < count; i++) {
    let a;
    let r;
    let y;
    if (i < 16) {
      // Clusters on the rim, leaving the front (camera side) uncluttered.
      do a = randRange(rng, 0, Math.PI * 2); while (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.6);
      r = randRange(rng, LAYOUT.basinInner + 0.2, LAYOUT.basinOuter - 0.1);
      y = 0.5;
    } else {
      // A few stepping stones around the pedestal bases.
      const side = i % 2 === 0 ? -1 : 1;
      const ang = randRange(rng, 0, Math.PI * 2);
      const px = side * LAYOUT.pedestalX + Math.sin(ang) * randRange(rng, 1.5, 2.1);
      const pz = LAYOUT.pedestalZ + Math.cos(ang) * randRange(rng, 1.5, 2.1);
      a = Math.atan2(px, pz);
      r = Math.hypot(px, pz);
      y = LAYOUT.waterLevel;
    }
    const sc = randRange(rng, 0.6, 1.35);
    p.set(Math.sin(a) * r, y, Math.cos(a) * r);
    e.set(randRange(rng, 0, 3), randRange(rng, 0, 3), randRange(rng, 0, 3));
    q.setFromEuler(e);
    s.set(sc, sc * randRange(rng, 0.55, 0.9), sc);
    m.compose(p, q, s);
    rocks.setMatrixAt(i, m);
    rocks.setColorAt(i, new THREE.Color(tones[i % tones.length]));
  }
  group.add(rocks);
  owned.push(geo, mat);
}

function createLilies(group, owned) {
  const rng = createRng('roots3d:lilies');
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12);
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE.lily, roughness: 0.7 });
  const count = 12;
  const lilies = new THREE.InstancedMesh(geo, mat, count);
  lilies.receiveShadow = true;

  const pads = [];
  const pedestals = [[-LAYOUT.pedestalX, LAYOUT.pedestalZ], [LAYOUT.pedestalX, LAYOUT.pedestalZ]];
  while (pads.length < count) {
    const a = randRange(rng, 0, Math.PI * 2);
    const r = randRange(rng, LAYOUT.islandRadius + 0.9, LAYOUT.basinInner - 0.7);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (pedestals.some(([px, pz]) => Math.hypot(x - px, z - pz) < 2.0)) continue;
    pads.push({ x, z, yaw: randRange(rng, 0, Math.PI * 2), spin: randRange(rng, -0.06, 0.06), s: randRange(rng, 0.7, 1.25) });
  }
  group.add(lilies);
  owned.push(geo, mat);
  return { mesh: lilies, pads };
}

function createFoam(group, owned) {
  const geo = new THREE.RingGeometry(0.92, 1.0, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
  const foam = new THREE.InstancedMesh(geo, mat, 2);
  group.add(foam);
  owned.push(geo, mat);
  return foam;
}

// ---------------------------------------------------------------------------
// Clouds: merged low-poly puffs drifting in the arc behind the board
// ---------------------------------------------------------------------------

const CLOUD_SHAPES = [
  [[0, 0, 0, 1.0], [1.0, -0.15, 0.1, 0.75], [-1.0, -0.2, 0.05, 0.7], [0.35, 0.45, -0.1, 0.7], [-0.45, 0.3, 0.2, 0.6], [1.7, -0.3, 0, 0.45]],
  [[0, 0, 0, 0.85], [0.9, 0.1, 0, 0.7], [1.7, -0.15, 0.1, 0.55], [-0.9, -0.1, 0, 0.65], [-1.6, -0.25, 0.05, 0.45], [0.3, 0.4, 0.1, 0.55], [-0.3, 0.35, -0.15, 0.5]],
];

function cloudGeometry(puffs) {
  const geo = mergeGeometries(puffs.map(([x, y, z, r]) => place(new THREE.IcosahedronGeometry(1, 1), { x, y, z, sx: r })));
  // Flatten the underside so they sit like soft cotton.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -0.3) pos.setY(i, -0.3 + (y + 0.3) * 0.25);
  }
  pos.needsUpdate = true;
  return geo;
}

const CLOUD_ARC_MIN = Math.PI - 1.25;
const CLOUD_ARC_SPAN = 2.5;

function createClouds(group, owned) {
  const rng = createRng('roots3d:clouds');
  const pivot = new THREE.Group(); // follows camera yaw, so clouds always stay behind the board
  pivot.name = 'clouds';
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.cloud,
    emissive: '#fff0dc',
    emissiveIntensity: 0.35,
    roughness: 1,
  });
  owned.push(mat);

  const layers = CLOUD_SHAPES.map((shape) => {
    const geo = cloudGeometry(shape);
    owned.push(geo);
    const mesh = new THREE.InstancedMesh(geo, mat, 4);
    mesh.frustumCulled = false; // instances move every step
    pivot.add(mesh);
    const clouds = [];
    for (let i = 0; i < 4; i++) {
      clouds.push({
        a0: CLOUD_ARC_MIN + randRange(rng, 0, CLOUD_ARC_SPAN),
        r: randRange(rng, 12.5, 16),
        y: randRange(rng, 2.4, 4.6),
        s: randRange(rng, 1.1, 1.9),
        speed: randRange(rng, 0.006, 0.012),
        yaw: randRange(rng, 0, Math.PI * 2),
        bob: randRange(rng, 0, Math.PI * 2),
      });
    }
    return { mesh, clouds };
  });
  group.add(pivot);
  return { pivot, layers };
}

// ---------------------------------------------------------------------------
// The diorama
// ---------------------------------------------------------------------------

// Builds the whole world into `scene`. update(dt, t, view) must be called from
// the sim step; view = { yaw, distance } from the camera rig.
export function createDiorama(scene) {
  const root = new THREE.Group();
  root.name = 'diorama';
  const owned = [];
  const uniforms = { uTime: { value: 0 } };

  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 30, 70);

  const lights = createLights(root);
  createTable(root, owned);
  createBasin(root, owned, uniforms);
  const { island, anchor: islandAnchor } = createIsland(root, owned);
  const pedestals = createPedestals(root, owned);
  createRocks(root, owned);
  const lilies = createLilies(root, owned);
  const foam = createFoam(root, owned);
  const clouds = createClouds(root, owned);
  scene.add(root);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const foamSpots = [[-LAYOUT.pedestalX, LAYOUT.pedestalZ, 1.42], [LAYOUT.pedestalX, LAYOUT.pedestalZ, 1.42]];

  function update(dt, t, view) {
    uniforms.uTime.value = t;

    // The island breathes on the water, very gently.
    island.position.y = LAYOUT.islandTop + Math.sin(t * 0.55) * 0.035;

    // Lily pads ride the same wave as the water surface.
    lilies.pads.forEach((pad, i) => {
      p.set(pad.x, LAYOUT.waterLevel + waveHeight(pad.x, pad.z, t) + 0.025, pad.z);
      e.set(0, pad.yaw + pad.spin * t, 0);
      q.setFromEuler(e);
      s.set(pad.s, 1, pad.s);
      m.compose(p, q, s);
      lilies.mesh.setMatrixAt(i, m);
    });
    lilies.mesh.instanceMatrix.needsUpdate = true;

    // Foam rings pulse softly around the pedestal bases.
    foamSpots.forEach(([x, z, r], i) => {
      const k = r * (1 + Math.sin(t * 1.3 + i * 2.1) * 0.025);
      p.set(x, LAYOUT.waterLevel + 0.11, z);
      q.identity();
      s.set(k, 1, k);
      m.compose(p, q, s);
      foam.setMatrixAt(i, m);
    });
    foam.instanceMatrix.needsUpdate = true;

    // Clouds drift along the back arc and shrink away at its ends.
    clouds.pivot.rotation.y = view ? view.yaw : 0;
    for (const layer of clouds.layers) {
      layer.clouds.forEach((c, i) => {
        const a = CLOUD_ARC_MIN + ((((c.a0 - CLOUD_ARC_MIN + c.speed * t) % CLOUD_ARC_SPAN) + CLOUD_ARC_SPAN) % CLOUD_ARC_SPAN);
        const edge = smoothstep(Math.min(a - CLOUD_ARC_MIN, CLOUD_ARC_MIN + CLOUD_ARC_SPAN - a) / 0.3);
        const k = c.s * Math.max(edge, 0.001);
        p.set(Math.sin(a) * c.r, c.y + Math.sin(t * 0.3 + c.bob) * 0.12, Math.cos(a) * c.r);
        e.set(0, c.yaw + a, 0);
        q.setFromEuler(e);
        s.set(k, k * 0.8, k);
        m.compose(p, q, s);
        layer.mesh.setMatrixAt(i, m);
      });
      layer.mesh.instanceMatrix.needsUpdate = true;
    }

    // Fog follows the camera distance so the board never washes out.
    if (view) {
      scene.fog.near = view.distance + 6;
      scene.fog.far = view.distance + 48;
    }
  }

  function dispose() {
    for (const r of owned) r.dispose();
    root.removeFromParent();
    scene.fog = null;
    scene.background = null;
  }

  update(0, 0, null);

  return {
    root,
    lights,
    islandAnchor,
    pedestals,
    update,
    dispose,
  };
}
