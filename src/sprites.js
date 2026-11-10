// Hand-authored pixel sprites and procedural silhouettes for characters.

import { clamp, lerp, hash1, disc, glow, rgba, TAU } from './util.js';

const GIRL_PAL = {
  H: '#221a2c', // hair
  h: '#3a2c4a', // hair rim light
  f: '#e7dbcf', // pale skin
  e: '#1b1a26', // eyes (empty)
  D: '#191522', // dress
  d: '#2a2237', // sleeve / arm
  b: '#0c0a11', // boots
  c: '#7c2738', // faded red thread
};

const GIRL_TOP = [
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HHffffHH..',
  '..HHffffHH..',
  '..HfeffefH..',
  '...HffffH...',
  '....HffH....',
  '.....ff.....',
  '..HDDDDDDH..',
  '..HDDDDDDH..',
  '..HDDDDDDH..',
  '..dDDDDDDd..',
  '...DDDDDD...',
  '..DDDDDDDD..',
  '..DDDDDDDD..',
  '.DDDDDDDDDD.',
];

const GIRL_LEGS = {
  idle: ['...dd..dd...', '...dd..dd...', '..bbb..bbb..'],
  a: ['..dd....dd..', '..dd....dd..', '.bbb....bbb.'],
  b: ['....dddd....', '....dddd....', '...bb..bb...'],
  c: ['...dd.dd....', '...dd.dd....', '..bbb.bbb...'],
};

function makeSprite(rows, pal) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

const frame = (legs) => [...GIRL_TOP, ...GIRL_LEGS[legs]];

export const GIRL = {
  w: 12,
  h: 19,
  idle: [makeSprite(frame('idle'), GIRL_PAL), makeSprite(frame('b'), GIRL_PAL)],
  walk: [
    makeSprite(frame('a'), GIRL_PAL),
    makeSprite(frame('b'), GIRL_PAL),
    makeSprite(frame('c'), GIRL_PAL),
    makeSprite(frame('b'), GIRL_PAL),
  ],
};

const GIRL_SIT_ROWS = [
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HHffffHH..',
  '..HfeffefH..',
  '...HffffH...',
  '..HDDDDDDH..',
  '.HDDDDDDDDH.',
  '.dDDDDDDDDd.',
  '.DDDDDDDDDD.',
  '..DDDDDDDD..',
  '..bb....bb..',
  '.bbb....bbb.',
];

// She sits. Knees drawn in, hands in her lap, the way a child waits.
export const GIRL_SIT = makeSprite(GIRL_SIT_ROWS, GIRL_PAL);

// Each of the four wears a different kind of power.
function drawSignature(g, style, cx, top, h, feetY, t, col, flare) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  if (style === 'boy') {
    // BLUE — electricity: jagged bolts crawling off his shoulders
    const tick = Math.floor(t * 7);
    for (let b = 0; b < 4; b++) {
      const n = hash1(b * 12.9 + cx * 0.7 + tick * 0.53);
      if (n < 0.3) continue;
      let x = cx + (b - 1.5) * 4;
      let y = top + h * 0.22 + (b % 2) * 4;
      const steps = 6 + Math.floor(n * 4);
      for (let k = 0; k < steps; k++) {
        x += (hash1(x * 1.7 + k * 3.1 + tick) - 0.5) * 7;
        y -= 2.4 + hash1(y * 2.1 + k * 5.3 + tick) * 2.6;
        g.fillStyle = rgba(col, (0.85 - k * 0.1) * flare);
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
        if (k % 3 === 0) {
          g.fillStyle = rgba('#ffffff', 0.7 * flare);
          g.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
      }
    }
    // a charge ring snapping out across the road
    const cyc = (t * 0.55 + cx * 0.01) % 1;
    if (cyc < 0.22) {
      const k = cyc / 0.22;
      const r = h * (0.2 + k * 0.35);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU;
        g.fillStyle = rgba(col, (1 - k) * 0.7 * flare);
        g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(feetY - 1 + Math.sin(a) * r * 0.28), 1, 1);
      }
    }
  } else if (style === 'girl') {
    // RED — fire: tongues of it lifting off her hair and shoulders
    glow(g, cx, top + h * 0.55, h * 0.55, '#ff7a3c', 0.14 * flare);
    for (let i = 0; i < 26; i++) {
      const ph = hash1(i * 3.3 + cx);
      const rise = (t * 0.95 + ph) % 1;
      const x = cx + Math.sin(t * 1.7 + i * 1.9) * (3 + ph * 7);
      const y = top + h * (0.35 + ph * 0.6) - rise * h * 0.55;
      const len = 2 + Math.round((1 - rise) * 3);
      g.fillStyle = rgba(col, (1 - rise) * 0.95 * flare);
      g.fillRect(Math.round(x), Math.round(y), 1, len);
      if (i % 3 === 0) {
        g.fillStyle = rgba('#ffd9a8', (1 - rise) * 0.8 * flare);
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
    // heat shimmer where she stands
    for (let i = 0; i < 14; i++) {
      const x = cx + Math.sin(t * 2.2 + i) * (h * 0.32);
      g.fillStyle = rgba('#ff8a5a', 0.4 * flare);
      g.fillRect(Math.round(x), Math.round(feetY - 1 - (i % 4)), 1, 1);
    }
  } else if (style === 'coat') {
    // YELLOW — light: long blades of it turning slowly around him
    const spin = t * 0.6;
    for (let i = 0; i < 8; i++) {
      const a = spin + (i / 8) * TAU;
      const r1 = h * (0.55 + 0.06 * Math.sin(t * 2 + i));
      for (let k = 0; k < 8; k++) {
        const r = lerp(h * 0.28, r1, k / 7);
        g.fillStyle = rgba(col, (0.55 - k * 0.05) * flare);
        g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(top + h * 0.45 + Math.sin(a) * r * 0.55), 1, 1);
      }
    }
    // a halo he does not bother to hide
    const r = h * 0.22;
    for (let i = 0; i < 24; i++) {
      const a = -spin * 1.6 + (i / 24) * TAU;
      g.fillStyle = rgba('#fff2c8', 0.5 * flare);
      g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(top + h * 0.05 + Math.sin(a) * r * 0.28), 1, 1);
    }
  } else {
    // BROWN — earth: the road itself lifts and circles him
    for (let i = 0; i < 14; i++) {
      const ph = hash1(i * 5.1 + cx);
      const cyc = (t * 0.55 + ph) % 1;
      const y = feetY - cyc * h * 0.95;
      const x = cx + Math.sin(t * 1.1 + ph * TAU) * (h * 0.45);
      const sz = i % 4 === 0 ? 2 : 1;
      g.fillStyle = rgba('#c89a68', (1 - Math.abs(cyc - 0.5) * 2) * 0.95 * flare);
      g.fillRect(Math.round(x), Math.round(y), sz + 1, sz);
      g.fillStyle = 'rgba(24,14,8,0.85)';
      g.fillRect(Math.round(x), Math.round(y) + sz, sz + 1, 1);
    }
    // and every few seconds the ground answers him
    const cyc = (t * 0.42 + 0.3) % 1;
    if (cyc < 0.32) {
      const k = cyc / 0.32;
      const r = h * (0.25 + k * 0.6);
      for (let i = 0; i < 44; i++) {
        const a = (i / 44) * TAU;
        g.fillStyle = rgba('#a07a52', (1 - k) * 0.75 * flare);
        g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(feetY - 1 + Math.sin(a) * r * 0.22), 1 + (i % 3 === 0 ? 1 : 0), 1);
      }
    }
  }
  g.restore();
}

// One of the four at the end of the city: a silhouette wearing its own light.
export function drawTeen(g, cx, baseY, t, opts = {}) {
  const col = opts.color || '#6fa8ff';
  const scale = opts.scale || 1;
  const style = opts.style || 'boy';
  const flare = opts.flare ?? 1;
  const facing = opts.facing || -1;
  const hover = Math.sin(t * 1.1 + cx * 0.07) * 1.4;
  const big = style === 'big';
  const h = Math.round((big ? 46 : style === 'coat' ? 42 : 40) * scale);
  const feetY = baseY - 2 + hover;
  const top = feetY - h;
  const headH = Math.round(h * 0.24);
  const neckY = top + headH;
  const hipY = feetY - Math.round(h * 0.3);
  const dark = '#07060c';

  g.save();
  // a dark pocket first, so the silhouette never dissolves into the city
  const pocket = g.createRadialGradient(cx, top + h * 0.45, 2, cx, top + h * 0.45, h * 0.85);
  pocket.addColorStop(0, 'rgba(2,2,6,0.62)');
  pocket.addColorStop(0.6, 'rgba(2,2,6,0.3)');
  pocket.addColorStop(1, 'rgba(2,2,6,0)');
  g.fillStyle = pocket;
  g.fillRect(cx - h, top - 16, h * 2, h + 32);
  // AURA — a coloured pocket of night with a breathing ring.
  g.globalCompositeOperation = 'lighter';
  glow(g, cx, top + h * 0.42, h * 0.95, col, 0.17 * flare);
  glow(g, cx, top + h * 0.42, h * 0.5, col, 0.18 * flare);
  const ringR = h * 0.5 + Math.sin(t * 1.6 + cx) * 1.5;
  for (let i = 0; i < 18; i++) {
    const a = t * 0.5 + (i / 18) * TAU;
    g.fillStyle = rgba(col, 0.15 * flare);
    g.fillRect(Math.round(cx + Math.cos(a) * ringR), Math.round(top + h * 0.42 + Math.sin(a) * ringR * 0.42), 1, 1);
  }
  g.globalCompositeOperation = 'source-over';

  // legs
  const legW = Math.max(2, Math.round(4 * scale));
  for (const s of [-1, 1]) {
    g.fillStyle = dark;
    g.fillRect(Math.round(cx + s * h * 0.09 - legW / 2), hipY, legW, feetY - hipY);
  }

  // torso: shoulders wide, waist narrow; the big one is a wall
  const shoulderW = Math.round(h * (big ? 0.52 : style === 'coat' ? 0.44 : 0.42));
  const waistW = Math.round(shoulderW * (big ? 0.82 : 0.62));
  for (let y = neckY; y < hipY; y++) {
    const k = (y - neckY) / Math.max(1, hipY - neckY);
    const ww = Math.round(lerp(shoulderW, waistW, k));
    g.fillStyle = dark;
    g.fillRect(Math.round(cx - ww / 2), y, ww, 1);
    g.fillStyle = rgba(col, 0.72 * flare);
    g.fillRect(Math.round(cx + facing * (ww / 2 - 1)), y, 1, 1);
    g.fillStyle = rgba(col, 0.24 * flare);
    g.fillRect(Math.round(cx - facing * (ww / 2 - 1)), y, 1, 1);
  }

  // arms
  const armW = Math.max(1, Math.round(2 * scale));
  for (const s of [-1, 1]) {
    const ax = cx + s * (shoulderW / 2);
    const swing = Math.sin(t * 1.3 + cx * 0.1 + s) * 1.2;
    const len = Math.round(h * 0.38);
    g.fillStyle = dark;
    for (let k = 0; k < len; k++) {
      g.fillRect(Math.round(ax + s * k * 0.06 + swing * (k / len)), neckY + 2 + k, armW, 1);
    }
  }

  // a collar and a belt in their own light, so the body is not just a void
  g.fillStyle = rgba(col, 0.55 * flare);
  g.fillRect(Math.round(cx - shoulderW / 2) + 1, neckY + 1, Math.max(1, shoulderW - 2), 1);
  g.fillRect(Math.round(cx - waistW / 2) + 1, hipY - 4, Math.max(1, waistW - 2), 1);

  // head and hair
  const headW = Math.round(headH * 1.02);
  g.fillStyle = '#0b0912';
  g.fillRect(Math.round(cx - headW / 2), top, headW, headH);
  g.fillStyle = dark;
  if (style === 'girl') {
    g.fillRect(Math.round(cx - headW / 2 - 2), top + 2, 3, Math.round(headH * 1.7));
    g.fillRect(Math.round(cx + headW / 2 - 1), top + 2, 3, Math.round(headH * 1.7));
  } else if (style === 'boy') {
    for (let i = 0; i < headW + 4; i++) {
      const sp = Math.abs(Math.sin(i * 1.7)) * 3;
      g.fillRect(Math.round(cx - headW / 2 - 2 + i), Math.round(top - sp), 1, Math.ceil(sp) + 1);
    }
  } else if (style === 'coat') {
    g.fillRect(Math.round(cx - headW / 2), Math.round(top - 2), headW, 3);
    g.fillRect(Math.round(cx - shoulderW * 0.55), hipY - 4, Math.round(shoulderW * 1.1), Math.round(h * 0.16));
  } else {
    g.fillRect(Math.round(cx - headW / 2 + 1), Math.round(top - 1), headW - 2, 2);
    g.fillRect(Math.round(cx - headW / 2 - 1), Math.round(top + 1), headW + 2, 2);
  }

  // eyes: two points of the same light
  const eyeY = Math.round(top + headH * 0.45);
  const eyeOff = Math.max(1, Math.round(headW * 0.2));
  const ew = Math.max(1, Math.round(2 * scale));
  const eh = Math.max(1, Math.round(scale));
  g.fillStyle = col;
  g.fillRect(Math.round(cx - eyeOff + facing), eyeY, ew, eh);
  g.fillRect(Math.round(cx + eyeOff + facing), eyeY, ew, eh);
  g.restore();

  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, cx - eyeOff, eyeY, 10 * scale, col, 0.3 * flare);
  glow(g, cx + eyeOff, eyeY, 10 * scale, col, 0.3 * flare);
  // light spilling onto the road under their feet
  glow(g, cx, feetY - 1, h * 0.42, col, 0.16 * flare);
  g.restore();

  // and the thing that makes each of them a problem
  drawSignature(g, style, cx, top, h, feetY, t, col, flare);
}

// A ghost shield: a pane of cold light held in front of a knight.
export function drawShield(g, cx, cy, t, color, strength, flash = 0) {
  const a = clamp(strength, 0, 1);
  if (a <= 0.01) return;
  const h = 40;
  const halfW = 11;
  const wob = Math.sin(t * 1.7) * 0.5;
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, cx, cy, 30, color, 0.16 * a + flash * 0.22);
  g.restore();

  g.save();
  g.globalAlpha = a;
  for (let i = 0; i < h; i++) {
    const v = i / h;
    const k = v < 0.18 ? 0.45 + (v / 0.18) * 0.55 : v < 0.72 ? 1 : 1 - ((v - 0.72) / 0.28) * 0.92;
    const ww = Math.max(1, Math.round(halfW * k + wob));
    const y = Math.round(cy - h * 0.6 + i);
    g.fillStyle = rgba(color, 0.13 + flash * 0.2);
    g.fillRect(Math.round(cx - ww), y, ww * 2, 1);
    g.fillStyle = rgba(color, 0.5 + flash * 0.4);
    g.fillRect(Math.round(cx - ww), y, 1, 1);
    g.fillRect(Math.round(cx + ww - 1), y, 1, 1);
  }
  // runes cut into the light
  g.fillStyle = rgba('#eaf4ff', 0.32 * a);
  const runeY = Math.round(cy - h * 0.22);
  g.fillRect(Math.round(cx), runeY, 1, 12);
  g.fillRect(Math.round(cx) - 4, runeY + 4, 9, 1);
  g.fillRect(Math.round(cx) - 3, runeY + 8, 7, 1);
  if (flash > 0.01) {
    g.fillStyle = rgba('#ffffff', 0.26 * flash * a);
    g.fillRect(Math.round(cx - halfW), Math.round(cy - h * 0.55), halfW * 2, h * 0.9);
  }
  g.restore();
}

// A tall shadow guardian, drawn column by column so it stays pixel-clean.
export function drawGuardian(g, cx, baseY, t, phase, opts = {}) {
  const scale = opts.scale || 1;
  const h = Math.round(56 * scale);
  const alpha = opts.alpha ?? 0.97;
  const breathe = Math.sin(t * 0.7 + phase) * 1.2;
  const sway = Math.sin(t * 0.42 + phase * 1.7) * 2.2 + breathe * 0.4;
  const lean = opts.lean || 0;
  // The crown bends furthest, the tail stays planted.
  const bendAt = (v) => lean * Math.pow(Math.max(0, 1 - v), 1.7);
  const eyeGlow = opts.eyeGlow ?? 0.26;

  const topY = baseY - h;
  const cxr = Math.round(cx);

  // AURA — a velvety pocket of darkness around the figure.
  g.save();
  g.globalCompositeOperation = 'source-over';
  const ax = cx + bendAt(0.2) * 0.7;
  const aura = g.createRadialGradient(ax, baseY - h * 0.5, 2, ax, baseY - h * 0.5, h * 0.8);
  aura.addColorStop(0, 'rgba(4,3,8,0.55)');
  aura.addColorStop(0.55, 'rgba(4,3,8,0.26)');
  aura.addColorStop(1, 'rgba(4,3,8,0)');
  g.fillStyle = aura;
  g.fillRect(ax - h, topY - 20, h * 2, h + 40);
  g.globalAlpha = alpha;

  // BODY profile (v = 0 at crown, 1 at the wisp tail).
  const prof = (v) => {
    let w;
    if (v < 0.10) w = lerp(3.0, 6.2, v / 0.1);
    else if (v < 0.19) w = lerp(6.2, 4.6, (v - 0.1) / 0.09);
    else if (v < 0.27) w = lerp(4.6, 9.2, (v - 0.19) / 0.08);
    else if (v < 0.52) w = lerp(9.2, 7.2, (v - 0.27) / 0.25);
    else if (v < 0.78) w = lerp(7.2, 3.4, (v - 0.52) / 0.26);
    else w = lerp(3.4, 0.4, (v - 0.78) / 0.22);
    return w;
  };

  const bodyDark = opts.color || '#050409';
  const rim = opts.rim || '#39435e';

  for (let row = 0; row < h; row++) {
    const v = row / h;
    const y = topY + row;
    const wob = Math.sin(t * 1.5 + v * 7.5 + phase) * (0.8 + v * 1.9);
    let half = prof(v) + wob;
    if (half <= 0.2) continue;
    const shift = (v < 0.2 ? Math.sin(t * 0.9 + phase) * 0.9 : sway * v * 0.5) + bendAt(v);
    const left = Math.round(cxr - half + shift);
    const right = Math.round(cxr + half + shift);

    // Tattered bottom: pixels flicker out of the tail.
    if (v > 0.72) {
      const seedPhase = Math.floor(t * 7 + phase * 13);
      for (let x = left; x <= right; x++) {
        const n = hash1(x * 3.1 + y * 7.7 + seedPhase * 0.73);
        const edge = 1 - (v - 0.72) / 0.28;
        if (n < 0.5 * (1 - edge) || n < 0.12) continue;
        g.fillStyle = bodyDark;
        g.fillRect(x, y, 1, 1);
      }
      continue;
    }

    g.fillStyle = bodyDark;
    g.fillRect(left, y, right - left + 1, 1);
    // Faint rim light so the silhouette reads against the dark.
    g.fillStyle = rim;
    if (v < 0.62) g.fillRect(right - 1, y, 1, 1);
    if (v < 0.4 && v > 0.2) g.fillRect(left, y, 1, 1);
  }

  // LONG ARMS with clawed hands.
  const shoulderY = topY + h * 0.27;
  const armLen = h * 0.52;
  for (let s = -1; s <= 1; s += 2) {
    const swing = Math.sin(t * 0.9 + phase + (s > 0 ? 1.1 : 0)) * 2.4;
    const baseX = cxr + s * (prof(0.3) - 1) + sway * 0.3 + bendAt(0.3);
    const tipX = baseX + s * (2.4 + swing * 0.7);
    const tipY = shoulderY + armLen + Math.sin(t * 0.6 + phase) * 1.5;
    const steps = Math.round(armLen);
    for (let i = 0; i < steps; i++) {
      const k = i / steps;
      const ax = baseX + (tipX - baseX) * (k * k * 0.9 + k * 0.1);
      const ay = shoulderY + (tipY - shoulderY) * k;
      g.fillStyle = bodyDark;
      g.fillRect(Math.round(ax), Math.round(ay), 2, 1);
    }
    // Fingers.
    for (let f = 0; f < 3; f++) {
      const fx = tipX + s * (f - 1) * 1.6 + (f === 1 ? s * 1.2 : 0);
      const fl = 3 + (f === 1 ? 2 : 0);
      for (let i = 0; i < fl; i++) {
        g.fillStyle = bodyDark;
        g.fillRect(Math.round(fx), Math.round(tipY + i), 1, 1);
      }
    }
  }

  // EYES — two pale points of light, no face.
  const eyeY = Math.round(topY + h * 0.10);
  const eyeX = cxr + bendAt(0.1);
  const eyeOff = Math.round(prof(0.1) * 0.42);
  const blink = Math.sin(t * 0.31 + phase * 2.3) > 0.985 ? 0.25 : 1;
  const eyeCol = opts.eye || '#dfe9f5';
  g.fillStyle = eyeCol;
  const ew = Math.max(1, Math.round(2 * scale));
  g.fillRect(eyeX - eyeOff, eyeY, ew, Math.max(1, Math.round(scale * blink)));
  g.fillRect(eyeX + eyeOff - ew + 1, eyeY, ew, Math.max(1, Math.round(scale * blink)));
  g.restore();

  // EYE GLOW (additive, drawn on top).
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, eyeX - eyeOff + 0.5, eyeY + 0.5, 11 * scale, opts.eye || '#b9d4ee', eyeGlow);
  glow(g, eyeX + eyeOff - 0.5, eyeY + 0.5, 11 * scale, opts.eye || '#b9d4ee', eyeGlow);
  g.restore();
}

// A memory wisp: soft light with a slowly turning sparkle.
export function drawWisp(g, x, y, t, color, found) {
  const pulse = 0.65 + Math.sin(t * 2.1 + x * 0.05) * 0.35;
  if (found) {
    g.save();
    g.globalAlpha = 0.28;
    glow(g, x, y, 8, color, 0.35);
    g.restore();
    return;
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, x, y, 16 + pulse * 6, color, 0.3 + pulse * 0.12);
  g.restore();

  disc(g, x, y, 1.6, '#f6f2ff');
  g.fillStyle = color;
  g.fillRect(Math.round(x - 1), Math.round(y), 3, 1);
  g.fillRect(Math.round(x), Math.round(y - 1), 1, 3);

  const a = t * 0.8 + x * 0.02;
  const spiral = [[0, -4], [4, 0], [0, 4], [-4, 0]];
  spiral.forEach(([sx, sy], i) => {
    const ang = a + (i * TAU) / 4;
    const rx = Math.cos(ang) * 4.2;
    const ry = Math.sin(ang) * 2.6;
    g.fillStyle = i % 2 ? color : '#efeaff';
    g.fillRect(Math.round(x + rx), Math.round(y + ry), 1, 1);
  });
}

// A black dog of the mainland: low, lean, and made almost entirely of shadow.
// The only bright thing about it is the pair of red eyes.
export function drawDog(g, cx, baseY, t, opts = {}) {
  const scale = opts.scale || 1;
  const facing = opts.facing || -1;
  const flash = opts.flash || 0;
  const run = opts.run || 0;
  const alpha = opts.alpha ?? 1;

  g.save();
  g.globalAlpha = alpha;
  g.translate(Math.round(cx), Math.round(baseY));
  g.scale(facing * scale, scale);

  // a dark pocket under it so the legs do not disappear into the sand
  g.fillStyle = 'rgba(8,5,7,0.4)';
  g.beginPath();
  g.ellipse(0, 0, 18, 3, 0, 0, TAU);
  g.fill();

  // tail, curled up and back
  g.strokeStyle = '#09070b';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-15, -11);
  g.quadraticCurveTo(-23, -15, -21, -24 + Math.sin(t * 3 + run) * 2);
  g.stroke();

  // four legs, with a little trot
  for (let i = 0; i < 4; i++) {
    const lx = -11 + i * 7;
    const swing = Math.sin(t * 7 + i * 1.7 + run) * (opts.moving ? 2.2 : 0.7);
    g.fillStyle = '#08070a';
    g.fillRect(lx + swing * 0.4, -6, 2, 7 + (i % 2));
    g.fillRect(lx + swing, -1, 3, 1);
  }

  // body and shoulders
  g.fillStyle = '#08070b';
  g.beginPath();
  g.moveTo(-17, -13);
  g.quadraticCurveTo(-8, -18, 5, -15);
  g.quadraticCurveTo(12, -15, 14, -11);
  g.lineTo(10, -5);
  g.quadraticCurveTo(-3, -3, -15, -7);
  g.closePath();
  g.fill();
  g.fillStyle = '#17121a';
  g.fillRect(-15, -15, 24, 1);
  for (let i = 0; i < 5; i++) {
    const sx = -13 + i * 5;
    g.fillRect(sx, -17 - (i % 2), 2, 2);
  }

  // head, ears, long snout
  g.fillStyle = '#09080c';
  g.beginPath();
  g.moveTo(8, -16);
  g.lineTo(15, -18);
  g.lineTo(14, -8);
  g.lineTo(8, -6);
  g.closePath();
  g.fill();
  g.fillRect(14, -12, 8, 5);
  g.fillRect(21, -9, 3, 2);
  g.beginPath();
  g.moveTo(9, -16);
  g.lineTo(8, -22);
  g.lineTo(12, -18);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(14, -17);
  g.lineTo(16, -21);
  g.lineTo(18, -16);
  g.closePath();
  g.fill();
  // teeth, barely there
  g.fillStyle = '#b9b2a8';
  g.fillRect(18, -7, 1, 1);
  g.fillRect(21, -8, 1, 1);

  // red eyes and their glow
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, 13, -14, 7, '#ff3b30', 0.5);
  glow(g, 17, -14, 6, '#ff3b30', 0.4);
  g.restore();
  g.fillStyle = '#ff5a45';
  g.fillRect(13, -15, 2, 1);
  g.fillRect(17, -15, 1, 1);

  // smoke peeling off its back
  g.save();
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.55 + i * 0.31 + run) % 1;
    g.fillStyle = `rgba(8,6,10,${(1 - ph) * 0.45})`;
    g.fillRect(-8 + i * 7, -20 - ph * 13, 2 + (i % 2), 1);
  }
  g.restore();

  if (flash > 0) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = flash * 0.55;
    g.fillStyle = '#ffffff';
    g.fillRect(-17, -22, 39, 22);
  }
  g.restore();
}

// The desert's last keeper: broad, low, and older than the road.
export function drawScorpion(g, cx, baseY, t, opts = {}) {
  const scale = opts.scale || 1;
  const facing = opts.facing || -1;
  const flash = opts.flash || 0;
  const stomp = opts.stomp || 0;
  const sting = opts.sting || 0;
  const claw = opts.claw || 0;

  g.save();
  g.translate(Math.round(cx), Math.round(baseY));
  g.scale(facing * scale, scale);

  // shadow and dust
  g.fillStyle = 'rgba(14,8,8,0.55)';
  g.beginPath();
  g.ellipse(0, 0, 46, 6, 0, 0, TAU);
  g.fill();

  // eight legs, jointed and scraping at the ground
  g.strokeStyle = '#1c1412';
  g.lineWidth = 3;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const sway = Math.sin(t * 4.2 + i * 1.4 + side) * 2;
      const rootX = -18 + i * 10;
      const kneeX = rootX + side * 13 + sway;
      const footX = rootX + side * 25 + sway * 1.5;
      g.beginPath();
      g.moveTo(rootX, -17);
      g.lineTo(kneeX, -10);
      g.lineTo(footX, -1);
      g.stroke();
      g.fillStyle = '#120d0d';
      g.fillRect(Math.round(footX) - 1, -2, 3, 2);
    }
  }

  // tail, curling up and over the back
  const tailBase = -27;
  const tailTipY = -62 + Math.sin(t * 2.4) * 2 - stomp * 4;
  g.strokeStyle = '#1b1210';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(tailBase, -20);
  g.quadraticCurveTo(-50, -30, -42, -49);
  g.quadraticCurveTo(-26, -70, -12, tailTipY);
  g.stroke();
  g.strokeStyle = '#33221a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(tailBase, -21);
  g.quadraticCurveTo(-47, -31, -40, -49);
  g.quadraticCurveTo(-25, -67, -13, tailTipY + 2);
  g.stroke();
  // the stinger
  g.fillStyle = '#0b090c';
  g.beginPath();
  g.moveTo(-14, tailTipY + 2);
  g.lineTo(-2, tailTipY + 14);
  g.lineTo(-17, tailTipY + 8);
  g.closePath();
  g.fill();
  if (sting > 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, -8, tailTipY + 10, 18, '#ff7a3c', 0.55 * sting);
    g.restore();
  }

  // abdomen and head-plate
  g.fillStyle = '#241816';
  g.beginPath();
  g.ellipse(-8, -19, 25, 13, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#34221c';
  g.beginPath();
  g.ellipse(-8, -24, 22, 8, 0, 0, TAU);
  g.fill();
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i % 2 ? '#4a3022' : '#2d1d18';
    g.fillRect(-25 + i * 8, -29 + (i % 2), 5, 2);
  }
  g.fillStyle = '#2c1c18';
  g.beginPath();
  g.ellipse(13, -18, 16, 11, 0, 0, TAU);
  g.fill();

  // claws, each with a hinge and two fingers
  for (const side of [-1, 1]) {
    const armX = 20;
    const armY = -20 + side * 3;
    const open = claw > 0 ? 4 : 1;
    g.strokeStyle = '#241713';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(armX - 2, armY);
    g.lineTo(armX + 15, armY - 8 + side * 3);
    g.stroke();
    g.fillStyle = '#2f1d17';
    g.beginPath();
    g.ellipse(armX + 19, armY - 9 + side * 3, 10, 7, 0.3 * side, 0, TAU);
    g.fill();
    g.fillStyle = '#130e0d';
    g.beginPath();
    g.moveTo(armX + 26, armY - 12 + side * 3);
    g.lineTo(armX + 35, armY - 15 + side * 3 - open);
    g.lineTo(armX + 28, armY - 6 + side * 3);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(armX + 27, armY - 8 + side * 3);
    g.lineTo(armX + 35, armY - 3 + side * 3 + open);
    g.lineTo(armX + 26, armY - 5 + side * 3);
    g.closePath();
    g.fill();
    g.fillStyle = '#7a4a2a';
    g.fillRect(armX + 16, armY - 12 + side * 3, 4, 1);
  }

  // eyes, a row of small red points
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, 22, -21, 12, '#ff4a32', 0.45);
  g.restore();
  g.fillStyle = '#ff6a45';
  g.fillRect(19, -22, 2, 1);
  g.fillRect(23, -23, 1, 1);
  g.fillRect(26, -21, 1, 1);

  // plates catching the last light
  g.fillStyle = 'rgba(204,126,74,0.35)';
  g.fillRect(-22, -28, 13, 1);
  g.fillRect(7, -24, 10, 1);

  if (flash > 0) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = flash * 0.45;
    g.fillStyle = '#ffffff';
    g.fillRect(-48, -70, 94, 70);
  }
  g.restore();
}

// Small floating dust / firefly sprite drawn directly.
export function drawMote(g, x, y, color, size = 1, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), size, size);
  g.restore();
}
