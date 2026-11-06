// A 5x7 bitmap font so all interface text is real pixel art.

const GLYPHS = {
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '11111/00100/00100/00100/00100/00100/11111',
  J: '00111/00010/00010/00010/00010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/11011/01010',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  0: '01110/10001/10011/10101/11001/10001/01110',
  1: '00100/01100/00100/00100/00100/00100/01110',
  2: '01110/10001/00001/00110/01000/10000/11111',
  3: '11111/00010/00100/00010/00001/10001/01110',
  4: '00010/00110/01010/10010/11111/00010/00010',
  5: '11111/10000/11110/00001/00001/10001/01110',
  6: '00110/01000/10000/11110/10001/10001/01110',
  7: '11111/00001/00010/00100/01000/01000/01000',
  8: '01110/10001/10001/01110/10001/10001/01110',
  9: '01110/10001/10001/01111/00001/00010/01100',
  '.': '00000/00000/00000/00000/00000/01100/01100',
  ',': '00000/00000/00000/00000/01100/01100/00100',
  "'": '01100/01100/00000/00000/00000/00000/00000',
  '!': '00100/00100/00100/00100/00100/00000/00100',
  '?': '01110/10001/00001/00110/00100/00000/00100',
  '-': '00000/00000/00000/11111/00000/00000/00000',
  ':': '00000/01100/01100/00000/01100/01100/00000',
  '/': '00001/00001/00010/00100/01000/10000/10000',
  '(': '00010/00100/01000/01000/01000/00100/00010',
  ')': '01000/00100/00010/00010/00010/00100/01000',
  '*': '00000/01010/00100/11111/00100/01010/00000',
  '+': '00000/00100/00100/11111/00100/00100/00000',
  '°': '01100/10010/01100/00000/00000/00000/00000',
};

const CACHE = new Map();

function glyphCanvas(ch, color, scale, shadow) {
  const key = `${ch}|${color}|${scale}|${shadow}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const rows = (GLYPHS[ch] || GLYPHS['?']).split('/');
  const w = 5 * scale + (shadow ? scale : 0);
  const h = 7 * scale + (shadow ? scale : 0);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const paint = (ox, oy, col) => {
    g.fillStyle = col;
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 5; x++) {
        if (rows[y][x] === '1') g.fillRect(x * scale + ox, y * scale + oy, scale, scale);
      }
    }
  };
  if (shadow) paint(scale, scale, shadow);
  paint(0, 0, color);
  CACHE.set(key, c);
  return c;
}

export function textWidth(str, scale = 1, spacing = 1) {
  const s = String(str);
  if (!s.length) return 0;
  return s.length * (5 + spacing) * scale - spacing * scale;
}

export function drawText(ctx, str, x, y, opts = {}) {
  const { color = '#e9e6ef', scale = 1, spacing = 1, align = 'left', shadow = null } = opts;
  const s = String(str).toUpperCase();
  const adv = (5 + spacing) * scale;
  const total = textWidth(s, scale, spacing);
  let cx = align === 'center' ? Math.round(x - total / 2) : align === 'right' ? Math.round(x - total) : Math.round(x);
  for (const ch of s) {
    if (ch !== ' ') {
      const gc = glyphCanvas(ch, color, scale, shadow);
      ctx.drawImage(gc, cx, Math.round(y));
    }
    cx += adv;
  }
  return total;
}

export function wrapText(str, maxWidth, scale = 1, spacing = 1) {
  const words = String(str).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (textWidth(test, scale, spacing) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
