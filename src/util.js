// Small math / color / pixel helpers shared by the whole game.

export const W = 480;
export const H = 270;
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smooth = (t) => t * t * (3 - 2 * t);
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (rng, a, b) => a + rng() * (b - a);
export const randInt = (rng, a, b) => Math.floor(a + rng() * (b - a + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

// Deterministic 1d hash, used for animated flicker without allocation.
export function hash1(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Smooth 1d value noise.
export function makeNoise1(seed) {
  const rng = mulberry32(seed);
  const n = 512;
  const table = new Float32Array(n);
  for (let i = 0; i < n; i++) table[i] = rng() * 2 - 1;
  return function (x) {
    const i = Math.floor(x);
    const f = x - i;
    const k = smooth(f);
    const a = table[((i % n) + n) % n];
    const b = table[(((i + 1) % n) + n) % n];
    return lerp(a, b, k);
  };
}

export function fbm1(noise, x, octaves = 3) {
  let v = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += noise(x * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return v / norm;
}

export function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  const c = (v) => clamp(Math.round(v), 0, 255);
  return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
}

export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

export function shade(hex, k) {
  const c = hexToRgb(hex);
  return rgbToHex(c[0] * k, c[1] * k, c[2] * k);
}

export function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function sampleStops(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const k = (t - t0) / (t1 - t0 || 1);
      return mix(c0, c1, k);
    }
  }
  return stops[stops.length - 1][1];
}

// Chunky vertical gradient: deliberate banding keeps the pixel-art feel.
export function vgrad(ctx, x, y, w, h, stops, bandH = 2) {
  for (let yy = 0; yy < h; yy += bandH) {
    const t = clamp((yy + bandH * 0.5) / h, 0, 1);
    ctx.fillStyle = sampleStops(stops, t);
    ctx.fillRect(x, y + yy, w, Math.min(bandH, h - yy));
  }
}

export function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

// Pixel disc (no antialiasing).
export function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const R = Math.round(r);
  for (let y = -R; y <= R; y++) {
    const dx = Math.floor(Math.sqrt(Math.max(0, R * R - y * y)));
    ctx.fillRect(Math.round(cx - dx), Math.round(cy + y), dx * 2 + 1, 1);
  }
}

export function glow(ctx, x, y, r, color, alpha = 1) {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  const c = hexToRgb(color);
  g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${alpha})`);
  g.addColorStop(0.45, `rgba(${c[0]},${c[1]},${c[2]},${alpha * 0.32})`);
  g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
