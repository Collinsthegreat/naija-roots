// Procedural canvas textures. Everything is drawn in code from seeded PRNGs, so
// the same key always draws the same pixels (CLAUDE.md §1, §3).

import * as THREE from 'three';
import { createRng, randRange, randInt } from './rng.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { repeat = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

// ---------------------------------------------------------------------------
// Wood: warm planks with soft grain and the odd knot
// ---------------------------------------------------------------------------

export function createWoodTexture(key = 'roots3d:wood') {
  const size = 1024;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const rng = createRng(key);
  const tones = ['#c99a63', '#bf8c55', '#d2a571', '#c4935c', '#b98551'];
  const planks = 9;
  const ph = size / planks;

  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    ctx.fillStyle = tones[randInt(rng, 0, tones.length - 1)];
    ctx.fillRect(0, y0, size, ph);

    // Long, gently wavy grain lines.
    const lines = randInt(rng, 16, 24);
    for (let i = 0; i < lines; i++) {
      const baseY = y0 + randRange(rng, 4, ph - 4);
      const amp = randRange(rng, 1, 5);
      const freq = randRange(rng, 0.004, 0.012);
      const phase = randRange(rng, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(96, 58, 28, ${randRange(rng, 0.05, 0.16).toFixed(3)})`;
      ctx.lineWidth = randRange(rng, 0.8, 2.2);
      ctx.beginPath();
      for (let x = 0; x <= size; x += 16) {
        const y = baseY + Math.sin(x * freq + phase) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // A soft knot now and then.
    if (rng() < 0.55) {
      const kx = randRange(rng, 80, size - 80);
      const ky = y0 + ph * randRange(rng, 0.3, 0.7);
      for (let r = 3; r >= 1; r--) {
        ctx.strokeStyle = `rgba(90, 52, 24, ${(0.08 * r).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 10 * r, 4 * r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Plank seam with a faint highlight under it.
    ctx.fillStyle = 'rgba(70, 40, 18, 0.45)';
    ctx.fillRect(0, y0, size, 2);
    ctx.fillStyle = 'rgba(255, 236, 200, 0.12)';
    ctx.fillRect(0, y0 + 2, size, 2);
  }

  // Gentle sun-bleached vignette toward the centre.
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.72);
  g.addColorStop(0, 'rgba(255, 240, 210, 0.10)');
  g.addColorStop(1, 'rgba(80, 45, 20, 0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  return toTexture(canvas);
}

// ---------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------

function drawProceduralFace(ctx, size, { skinColor, hairColor, body }) {
  ctx.fillStyle = skinColor;
  ctx.fillRect(0, 0, size, size);

  const s = size / 256;
  const eyeY = 120 * s;
  const eyes = [92 * s, 164 * s];

  // Cheeks
  ctx.fillStyle = 'rgba(214, 96, 80, 0.22)';
  for (const ex of eyes) {
    ctx.beginPath();
    ctx.ellipse(ex + (ex < 128 * s ? -8 : 8) * s, 160 * s, 20 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Brows
  ctx.strokeStyle = hairColor;
  ctx.lineCap = 'round';
  ctx.lineWidth = 7 * s;
  for (const ex of eyes) {
    ctx.beginPath();
    ctx.arc(ex, eyeY - 6 * s, 20 * s, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }

  // Eyes with a bright highlight
  for (const ex of eyes) {
    ctx.fillStyle = '#24170f';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY + 14 * s, 11 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + 4 * s, eyeY + 9 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
    if (body === 'female') {
      ctx.strokeStyle = '#24170f';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(ex + (ex < 128 * s ? -10 : 10) * s, eyeY + 4 * s);
      ctx.lineTo(ex + (ex < 128 * s ? -16 : 16) * s, eyeY - 1 * s);
      ctx.stroke();
    }
  }

  // Nose and a warm smile
  ctx.strokeStyle = 'rgba(60, 30, 15, 0.35)';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.arc(128 * s, 150 * s, 8 * s, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  ctx.strokeStyle = '#5a2418';
  ctx.lineWidth = 6 * s;
  ctx.beginPath();
  ctx.arc(128 * s, 168 * s, 24 * s, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
}

// Draws start.ng's face picture inside a soft circle that blends into the skin.
function drawImageFace(ctx, size, img, skinColor) {
  ctx.fillStyle = skinColor;
  ctx.fillRect(0, 0, size, size);
  const r = size * 0.47;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.clip();
  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  ctx.restore();

  const g = ctx.createRadialGradient(size / 2, size / 2, r * 0.82, size / 2, size / 2, r * 1.02);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, skinColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

// A face texture for an avatar faceplate or flag. Always returns a texture
// right away (procedural face); if a start.ng face PNG data URL is given it is
// decoded and swapped in when ready. The decode never touches the network.
// Face pictures still decoding (capture tooling waits for them; see whenTexturesReady).
const pendingImages = new Set();

export function createFaceTexture(style, faceUrl = null, size = 256) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawProceduralFace(ctx, size, style);
  const tex = toTexture(canvas);

  if (typeof faceUrl === 'string' && faceUrl.startsWith('data:image/')) {
    const img = new Image();
    const loaded = new Promise((resolve) => {
      img.onload = () => {
        if (img.width && img.height) {
          drawImageFace(ctx, size, img, style.skinColor);
          tex.needsUpdate = true;
        }
        resolve();
      };
      img.onerror = () => resolve(); // the drawn face stays
    });
    pendingImages.add(loaded);
    loaded.then(() => pendingImages.delete(loaded));
    img.src = faceUrl;
  }
  return tex;
}

// Resolves once every face picture requested so far has loaded (or failed and
// kept the drawn face). Every other texture is drawn synchronously on a canvas.
export function whenTexturesReady() {
  return Promise.all([...pendingImages]).then(() => (pendingImages.size ? whenTexturesReady() : undefined));
}

// ---------------------------------------------------------------------------
// Woven trim patterns for the storyteller's attire
// ---------------------------------------------------------------------------

// kind: 'zigzag' | 'diamond' | 'stripes'. colors: 2–3 hex strings.
export function createPatternTexture(colors, kind = 'zigzag') {
  const w = 256;
  const h = 64;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const [a, b, c = b] = colors;

  ctx.fillStyle = a;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, w, 6);
  ctx.fillRect(0, h - 6, w, 6);

  ctx.fillStyle = b;
  ctx.strokeStyle = b;
  if (kind === 'diamond') {
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 16, 12);
      ctx.lineTo(x + 30, 32);
      ctx.lineTo(x + 16, 52);
      ctx.lineTo(x + 2, 32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c;
      ctx.fillRect(x + 13, 29, 6, 6);
      ctx.fillStyle = b;
    }
  } else if (kind === 'stripes') {
    for (let x = 0; x < w; x += 16) ctx.fillRect(x, 10, 7, h - 20);
    ctx.fillStyle = c;
    for (let x = 8; x < w; x += 32) ctx.fillRect(x, 26, 8, 12);
  } else {
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, (x / 16) % 2 === 0 ? 16 : 48);
    ctx.stroke();
    ctx.fillStyle = c;
    for (let x = 16; x < w; x += 32) {
      ctx.beginPath();
      ctx.arc(x, 32, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(canvas, { repeat: true });
}

// ---------------------------------------------------------------------------
// Small text labels (debug views)
// ---------------------------------------------------------------------------

export function createLabelTexture(text, { fg = '#2b2118', bg = '#fffaf1', width = 256, height = 96 } = {}) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(4, 4, width - 8, height - 8, height / 2.6);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = `700 ${Math.round(height * 0.42)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 2);
  return toTexture(canvas);
}
