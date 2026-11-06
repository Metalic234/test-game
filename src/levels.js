// Level construction: ground heightmaps, baked pixel terrain, parallax layers,
// light sources, collision solids and memory objects for each biome.

import {
  W,
  H,
  clamp,
  lerp,
  smooth,
  mulberry32,
  rand,
  randInt,
  pick,
  makeNoise1,
  fbm1,
  mix,
  shade,
  rgba,
  disc,
  makeCanvas,
} from './util.js';

const CONFIGS = [
  {
    id: 'forest',
    numeral: 'I',
    name: 'THE ENCHANTED FOREST',
    theme: 'forest',
    width: 3300,
    seed: 7311,
    spawnX: 42,
    exitX: 3200,
    amp: 3.6,
    points: [
      [0, 238], [260, 230], [520, 238], [780, 220], [1040, 231], [1280, 209],
      [1520, 227], [1780, 236], [2020, 216], [2280, 231], [2520, 208],
      [2780, 228], [3040, 237], [3300, 229],
    ],
    memories: [
      {
        id: 'ribbon', x: 1010, title: 'A RIBBON', color: '#e0556b',
        text: 'Red thread in the moss. Someone tied it here so they could find the way home.',
      },
      {
        id: 'doll', x: 2950, title: 'A DOLL', color: '#c8a2d8',
        text: 'Her painted face has worn away. Only the shape of a smile is left.',
      },
    ],
    power: {
      id: 'leap', x: 2380, name: 'VERDANT LEAP', color: '#7fe0a4',
      text: 'The forest lends her a second step in the air. She does not ask why.',
    },
  },
  {
    id: 'desert',
    numeral: 'II',
    name: 'THE FORGOTTEN DESERT',
    theme: 'desert',
    width: 3000,
    seed: 9182,
    spawnX: 42,
    exitX: 2900,
    amp: 2.1,
    points: [
      [0, 242], [420, 230], [820, 244], [1220, 224], [1620, 240],
      [2020, 226], [2420, 242], [2800, 229], [3000, 236],
    ],
    memories: [
      {
        id: 'door', x: 2440, title: 'A DOOR', color: '#d8c39a',
        text: 'A door standing alone in the dunes. Behind it, more desert. No walls. No house.',
      },
    ],
    power: {
      id: 'dash', x: 1520, name: 'EMBER DASH', color: '#ffb066',
      text: 'The sand gives her its heat. For a breath she is already somewhere else.',
    },
  },
  {
    id: 'mountain',
    numeral: 'III',
    name: 'THE FROZEN MOUNTAIN',
    theme: 'mountain',
    width: 2800,
    seed: 4407,
    spawnX: 42,
    exitX: 2700,
    amp: 4.2,
    points: [
      [0, 244], [300, 237], [600, 226], [900, 210], [1180, 193],
      [1480, 178], [1780, 158], [2080, 141], [2380, 126], [2640, 114], [2800, 109],
    ],
    memories: [
      {
        id: 'coat', x: 1210, title: 'A COAT', color: '#b7c8e0',
        text: 'Small, and far too thin. Folded neatly on the snow, waiting to be worn again.',
      },
    ],
    power: {
      id: 'glide', x: 1760, name: 'FROST GLIDE', color: '#bfe6ff',
      text: 'The cold holds her weight. Hold W while falling and the mountain sets her down.',
    },
  },
  {
    id: 'village',
    numeral: 'IV',
    name: 'THE LOST CIVILIZATION',
    theme: 'village',
    width: 1240,
    seed: 6621,
    spawnX: 40,
    exitX: 1120,
    amp: 1.4,
    points: [
      [0, 256], [220, 253], [440, 257], [680, 252], [920, 256], [1120, 253], [1240, 250],
    ],
    memories: [
      {
        id: 'grave', x: 1000, title: 'NINE STONES', color: '#b8b0a8',
        text: 'Nine small stones in a row. She remembers placing every one of them.',
      },
    ],
  },
  {
    id: 'city',
    numeral: 'V',
    name: 'THE LAST CITY',
    theme: 'city',
    width: 2340,
    seed: 5150,
    spawnX: 30,
    exitX: 2320,
    amp: 1.2,
    points: [
      [0, 247], [320, 246], [640, 248], [960, 245], [1280, 247],
      [1600, 244], [1920, 246], [2200, 245], [2340, 246],
    ],
    memories: [],
  },
];

// The four who wait at the end of the last street. Story only — never playable.
const CITY_TEENS = [
  { x: 2032, color: '#6fa8ff', style: 'boy', scale: 1 },
  { x: 2094, color: '#ff5a6a', style: 'girl', scale: 1 },
  { x: 2156, color: '#ffd166', style: 'coat', scale: 1.05 },
  { x: 2226, color: '#b07a4a', style: 'big', scale: 1.3 },
];

export const TOTAL_MEMORIES = CONFIGS.reduce((n, c) => n + c.memories.length, 0);
export const LEVEL_COUNT = CONFIGS.length;

function buildGround(width, points, amp, seed) {
  const noise = makeNoise1(seed);
  const noise2 = makeNoise1(seed + 77);
  const g = new Float32Array(width);
  let seg = 0;
  for (let x = 0; x < width; x++) {
    while (seg < points.length - 2 && x > points[seg + 1][0]) seg++;
    const p0 = points[seg];
    const p1 = points[seg + 1];
    const t = clamp((x - p0[0]) / Math.max(1, p1[0] - p0[0]), 0, 1);
    const base = lerp(p0[1], p1[1], smooth(t));
    const taper = Math.sin(Math.PI * t);
    const n = fbm1(noise, x * 0.021, 3) * 0.75 + fbm1(noise2, x * 0.006, 2) * 0.85;
    g[x] = base + n * amp * taper;
  }
  return g;
}

export function groundAt(level, x) {
  const i = clamp(Math.round(x), 0, level.width - 1);
  return level.ground[i];
}

// ---------- tiny painting primitives ---------------------------------------

const R = Math.round;
function rect(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(R(x), R(y), Math.max(1, R(w)), Math.max(1, R(h)));
}

function blob(g, cx, cy, rx, ry, color, rng, speckColor) {
  g.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const k = Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)));
    const w = Math.max(1, Math.round(rx * k));
    g.fillRect(R(cx - w), R(cy + y), w * 2, 1);
  }
  if (speckColor) {
    g.fillStyle = speckColor;
    for (let i = 0; i < rx * ry * 0.5; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng());
      g.fillRect(R(cx + Math.cos(a) * rx * r), R(cy + Math.sin(a) * ry * r), 1, 1);
    }
  }
}

function branch(g, x, y, ang, len, wid, color, rng, depth) {
  if (len < 2.5 || depth > 4) return;
  const steps = Math.max(2, Math.round(len / 2));
  let cx = x;
  let cy = y;
  let a = ang;
  for (let i = 0; i < steps; i++) {
    a += (rng() - 0.5) * 0.16;
    cx += Math.cos(a) * 2;
    cy += Math.sin(a) * 2;
    rect(g, cx, cy, wid, 1, color);
  }
  const n = rng() < 0.55 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const na = a + (rng() - 0.5) * 1.5;
    branch(g, cx, cy, na, len * 0.62, Math.max(1, wid * 0.62), color, rng, depth + 1);
  }
}

function treeSilhouette(g, x, baseY, h, color, rng, spread = 1) {
  const trunkH = h * 0.62;
  const w = Math.max(1.2, h * 0.035);
  rect(g, x - w / 2, baseY - trunkH, w, trunkH, color);
  for (let i = 0; i < 3; i++) {
    const by = baseY - trunkH * rand(rng, 0.45, 1);
    const dir = rng() < 0.5 ? -1 : 1;
    branch(g, x, by, dir > 0 ? rand(rng, -0.9, -0.2) : Math.PI + rand(rng, 0.2, 0.9),
      (h - trunkH) * rand(rng, 0.35, 0.6) * spread, Math.max(1, w * 0.8), color, rng, 0);
  }
  // canopy mass: overlapping round clumps, not flat discs
  for (let i = 0; i < 6; i++) {
    const rx = h * rand(rng, 0.1, 0.18);
    blob(g, x + rand(rng, -h * 0.12, h * 0.12), baseY - trunkH - rand(rng, 0, h * 0.26), rx, rx * rand(rng, 0.6, 0.85), color, rng);
  }
}

function ancientTree(g, x, baseY, rng, opts = {}) {
  const h = opts.h ?? rand(rng, 170, 240);
  const trunkW = opts.w ?? rand(rng, 13, 24);
  const lean = rand(rng, -5, 5);
  const color = opts.color ?? '#0a1512';
  const rim = opts.rim ?? '#12241d';
  const cxAt = (y) => x + lean * ((baseY - y) / h);
  // root flare
  for (let i = 0; i < 9; i++) {
    const dir = i < 5 ? -1 : 1;
    const len = rand(rng, 5, 24);
    for (let k = 0; k < len; k++) {
      const rx = x + dir * k * 0.85;
      const ry = baseY + Math.sin(k * 0.55 + i) * 1.4 + k * 0.12;
      rect(g, rx, ry, 1, 1, color);
    }
  }
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const w = Math.max(2, trunkW * (1 - t * 0.58));
    const cx = cxAt(baseY - y);
    rect(g, cx - w / 2, baseY - y, w, 1, color);
    if (t < 0.5) rect(g, cx + w / 2 - 1, baseY - y, 1, 1, rim);
  }
  const branches = randInt(rng, 2, 4);
  for (let i = 0; i < branches; i++) {
    const by = baseY - h * rand(rng, 0.42, 0.9);
    const dir = rng() < 0.5 ? -1 : 1;
    branch(g, cxAt(by), by, dir > 0 ? rand(rng, -1.0, -0.35) : Math.PI + rand(rng, 0.35, 1.0),
      rand(rng, 22, 58), 2, color, rng, 0);
  }
  // canopy: layered round clumps with a faint lit edge
  const canopyY = baseY - h;
  for (let i = 0; i < 8; i++) {
    const cx2 = x + rand(rng, -40, 40);
    const cy2 = canopyY + rand(rng, -10, 34);
    const rx = rand(rng, 13, 30);
    blob(g, cx2, cy2, rx, rx * rand(rng, 0.55, 0.8), color, rng, rim);
  }
  for (let i = 0; i < 3; i++) {
    blob(g, x + rand(rng, -26, 26), canopyY + rand(rng, 4, 28), rand(rng, 7, 14), rand(rng, 4, 8), mix(color, rim, 0.6), rng);
  }
  // hanging vines
  g.fillStyle = '#0d1e19';
  for (let i = 0; i < 4; i++) {
    const vx = x + rand(rng, -30, 30);
    const vlen = rand(rng, 30, 90);
    for (let k = 0; k < vlen; k++) {
      g.fillRect(R(vx + Math.sin(k * 0.09 + i) * 2), R(canopyY + 26 + k), 1, 1);
    }
  }
}

function mushroomCluster(g, x, baseY, rng, colors) {
  const n = randInt(rng, 2, 5);
  let top = baseY;
  for (let i = 0; i < n; i++) {
    const mx = x + rand(rng, -10, 10);
    const stemH = rand(rng, 2, 7);
    const capW = rand(rng, 3, 8);
    const col = pick(rng, colors);
    const my = baseY - rand(rng, 0, 2);
    // stem
    rect(g, mx, my - stemH, 1, stemH + 1, '#93a08f');
    // cap
    const capH = Math.max(2, Math.round(capW / 2.4));
    for (let r = 0; r < capH; r++) {
      const w = capW - r * (capW / (capH + 0.6));
      rect(g, mx - w / 2, my - stemH - 1 - r, w, 1, col);
    }
    rect(g, mx - capW * 0.22, my - stemH - capH, Math.max(1, capW * 0.3), 1, mix(col, '#ffffff', 0.55));
    top = Math.min(top, my - stemH - capH);
  }
  return top;
}

function pineTree(g, x, baseY, h, color, rng, snow) {
  rect(g, x - 0.5, baseY - h * 0.35, 1.4, h * 0.35, color);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const ty = baseY - h * (0.18 + (i / tiers) * 0.8);
    const halfW = (1 - i / tiers) * h * 0.3 + 1.5;
    const th = h * 0.26;
    for (let r = 0; r < th; r++) {
      const w = halfW * (1 - r / th);
      rect(g, x - w, ty - r, w * 2, 1, color);
    }
    if (snow) {
      for (let r = 0; r < th * 0.35; r++) {
        const w = halfW * (1 - r / th) * 0.75;
        rect(g, x - w, ty - r, w * 2, 1, snow);
      }
    }
  }
}

function ruinWall(g, x, baseY, w, h, color, rng, brick) {
  const top = baseY - h;
  for (let i = 0; i < w; i++) {
    const jag = Math.sin(i * 0.8 + x * 0.1) * 1.6 + rng() * 2.2;
    const yy = R(top + Math.max(0, jag));
    rect(g, x + i, yy, 1, baseY - yy, color);
  }
  // brick courses
  g.fillStyle = brick;
  for (let y = top + 3; y < baseY; y += 4) {
    for (let i = 0; i < w; i += 7) {
      g.fillRect(R(x + i + ((y / 4) % 2) * 3), R(y), 3, 1);
    }
  }
  // window holes
  g.fillStyle = '#08060a';
  if (w > 10) {
    const wx = x + w * 0.25;
    const wy = top + h * 0.4;
    g.fillRect(R(wx), R(wy), 3, 4);
    if (rng() < 0.5) g.fillRect(R(wx + 6), R(wy), 3, 4);
  }
}

function emberDots(g, x, y, w, h, rng, color) {
  g.fillStyle = color;
  const n = Math.max(2, (w * h) / 220);
  for (let i = 0; i < n; i++) {
    g.fillRect(R(x + rng() * w), R(y + rng() * h), 1, 1);
  }
}

function bones(g, x, y, rng) {
  const col = '#d8d2c2';
  // ribcage arc
  for (let i = 0; i < 5; i++) {
    const bx = x + i * 3;
    for (let k = 0; k < 7; k++) {
      const a = (k / 6) * Math.PI;
      rect(g, bx + Math.cos(a) * 3, y - Math.sin(a) * 5, 1, 1, col);
    }
  }
  rect(g, x - 2, y + 1, 18, 1, shade(col, 0.8));
  // skull
  rect(g, x + 18, y - 4, 4, 4, col);
  rect(g, x + 19, y - 3, 1, 1, '#3d3a33');
  rect(g, x + 21, y - 3, 1, 1, '#3d3a33');
}

function cairn(g, x, baseY, rng) {
  const stones = randInt(rng, 3, 5);
  let y = baseY;
  for (let i = 0; i < stones; i++) {
    const w = rand(rng, 5, 9) - i;
    const h = rand(rng, 2, 4);
    rect(g, x - w / 2, y - h, w, h, i % 2 ? '#4a5568' : '#39435a');
    rect(g, x - w / 2, y - h, w, 1, '#7d8ba3');
    y -= h;
  }
}

// ---------- terrain painters ----------------------------------------------

function paintForest(level, g, rng) {
  const { width, ground } = level;
  for (let x = 0; x < width; x++) {
    const gy = R(ground[x]);
    rect(g, x, gy, 1, 2, '#1b2d24');
    rect(g, x, gy + 2, 1, 5, '#13211b');
    rect(g, x, gy + 7, 1, 14, '#0d1915');
    rect(g, x, gy + 21, 1, H - gy - 21, '#080f0d');
  }
  // mossy variation + soil grit
  for (let i = 0; i < width * 1.6; i++) {
    const x = rng() * width;
    const gy = R(ground[x | 0]);
    const y = gy + 2 + rng() * 26;
    rect(g, x, y, 1, 1, pick(rng, ['#152a20', '#0d1a15', '#1b3327', '#091210']));
  }
  // grass tufts
  for (let i = 0; i < width * 0.55; i++) {
    const x = rng() * width;
    const gy = R(ground[x | 0]);
    const col = pick(rng, ['#1d392c', '#264636', '#162c23']);
    const hh = randInt(rng, 1, 4);
    for (let k = 0; k < hh; k++) rect(g, x + (k > 2 ? 1 : 0), gy - 1 - k, 1, 1, col);
    if (rng() < 0.25) rect(g, x, gy - 1, 1, 1, '#3f7d5c');
  }
  // roots creeping out of the soil
  g.fillStyle = '#0a1411';
  for (let i = 0; i < 40; i++) {
    const x = rng() * width;
    const gy = R(ground[x | 0]);
    for (let k = 0; k < 12; k++) {
      g.fillRect(R(x + Math.sin(k * 0.4 + i) * 2.2), gy + 2 + k, 1, 1);
    }
  }

  // memory stones (small markers so the wisps sit on something)
  for (const m of level.memories) {
    const gy = R(groundAt(level, m.x));
    rect(g, m.x - 3, gy - 2, 6, 2, '#182b22');
    rect(g, m.x - 2, gy - 3, 4, 1, '#22402f');
  }

  // boulders + a fallen log
  const boulders = [700, 1580, 2470];
  for (const bx of boulders) {
    const gy = R(groundAt(level, bx));
    const w = randInt(rng, 14, 20);
    const hh = randInt(rng, 10, 13);
    blob(g, bx, gy - hh / 2 + 1, w / 2, hh / 2, '#16211d', rng, '#1e2e27');
    rect(g, bx - w / 3, gy - hh + 1, w * 0.55, 1, '#2b4038');
    level.solids.push({ x: bx - w / 2, y: gy - hh, w, h: hh });
  }
  {
    const lx = 1980;
    const gy = R(groundAt(level, lx));
    rect(g, lx, gy - 8, 46, 8, '#121d19');
    rect(g, lx, gy - 8, 46, 1, '#1e3129');
    level.solids.push({ x: lx, y: gy - 8, w: 46, h: 8 });
    for (let i = 0; i < 6; i++) {
      mushroomCluster(g, lx + 6 + i * 7, gy - 8, rng, ['#4fd4c4', '#58b8a0']);
    }
  }

  // ancient trees
  const treeSpots = [];
  let tx = rand(rng, 120, 220);
  while (tx < width - 60) {
    treeSpots.push(tx);
    tx += rand(rng, 210, 380);
  }
  for (const x of treeSpots) {
    ancientTree(g, x, R(groundAt(level, x)), rng);
  }
  // mid-distance trunks (behind, read as depth)
  for (let i = 0; i < width / 260; i++) {
    const x = rng() * width;
    const gy = R(groundAt(level, x));
    const h = rand(rng, 60, 120);
    rect(g, x, gy - h, rand(rng, 3, 6), h, '#08110f');
  }

  // glowing mushrooms
  const glowColors = [
    ['#5fe3d4', '#9ff5ea'],
    ['#b98ce8', '#dcc0ff'],
    ['#7fe0a4', '#c6ffd6'],
  ];
  for (let i = 0; i < 16; i++) {
    const x = rand(rng, 60, width - 60);
    const gy = R(groundAt(level, x));
    const pal = pick(rng, glowColors);
    const top = mushroomCluster(g, x, gy, rng, [pal[0], pal[1]]);
    level.lights.push({
      x, y: top + 2, r: rand(rng, 24, 44), color: pal[1], alpha: rand(rng, 0.24, 0.38), flicker: 0.5,
    });
  }
  // glowing flowers
  for (let i = 0; i < 26; i++) {
    const x = rand(rng, 20, width - 20);
    const gy = R(groundAt(level, x));
    rect(g, x, gy - 1, 1, 1, '#bfe9ff');
    level.lights.push({ x, y: gy - 1, r: rand(rng, 6, 12), color: '#bfe9ff', alpha: 0.2, flicker: 0.8 });
  }
  // ferns
  for (let i = 0; i < 60; i++) {
    const x = rand(rng, 0, width);
    const gy = R(groundAt(level, x));
    const dir = rng() < 0.5 ? -1 : 1;
    const len = randInt(rng, 4, 9);
    g.fillStyle = pick(rng, ['#1c3a2b', '#254a36']);
    for (let k = 0; k < len; k++) {
      g.fillRect(R(x + dir * k * 0.8), R(gy - Math.sin((k / len) * Math.PI) * len * 0.8), 1, 1);
    }
  }
}

function paintDesert(level, g, rng) {
  const { width, ground } = level;
  for (let x = 0; x < width; x++) {
    const gy = R(ground[x]);
    rect(g, x, gy, 1, 2, '#ece2c6');
    rect(g, x, gy + 2, 1, 3, '#ddcfab');
    rect(g, x, gy + 5, 1, 6, '#cbb994');
    rect(g, x, gy + 11, 1, 12, '#b09c78');
    rect(g, x, gy + 23, 1, H - gy - 23, '#8a795c');
  }
  // wind ripples following the surface
  for (let k = 1; k < 12; k++) {
    const depth = k * k * 0.9 + 3;
    for (let x = 0; x < width; x++) {
      const gy = R(ground[x]);
      const y = gy + depth + Math.sin(x * 0.055 + k * 1.7) * 1.2;
      if (y > H) continue;
      g.fillStyle = k < 4 ? 'rgba(255,250,230,0.13)' : 'rgba(90,78,58,0.16)';
      g.fillRect(x, R(y), 1, 1);
    }
  }
  // grit
  for (let i = 0; i < width * 0.5; i++) {
    const x = rng() * width;
    const gy = R(ground[x | 0]);
    rect(g, x, gy + rng() * 40, 1, 1, pick(rng, ['#f3ebd4', '#a08d6c', '#c2b08b']));
  }

  // a lone dead tree
  {
    const x = 520;
    const gy = R(groundAt(level, x));
    rect(g, x, gy - 26, 3, 26, '#6d5f49');
    branch(g, x + 1, gy - 26, -1.9, 16, 2, '#6d5f49', rng, 0);
    branch(g, x + 2, gy - 20, -1.15, 20, 2, '#6d5f49', rng, 0);
    branch(g, x + 1, gy - 14, -2.4, 14, 1, '#6d5f49', rng, 0);
  }
  // a broken arch: the fallen lintel, then half-buried pillars she can hop
  {
    const px1 = 1640;
    const gy = R(groundAt(level, px1));
    // the lintel comes first, so the pillars never crowd the way past it
    rect(g, px1 - 10, gy - 6, 40, 6, '#b5a384');
    level.solids.push({ x: px1 - 10, y: gy - 6, w: 40, h: 6 });
    for (let i = 0; i < 4; i++) {
      const x = px1 + 52 + i * 34;
      const pgy = R(groundAt(level, x));
      // never taller than a jump clears (her apex is ~19px)
      const hh = 8 + Math.round(rng() * 6);
      rect(g, x, pgy - hh, 9, hh, '#c4b393');
      rect(g, x, pgy - hh, 9, 2, '#d8c9ab');
      rect(g, x + 2, pgy - hh + 4, 5, 1, '#9c8b6d');
      rect(g, x + 2, pgy - hh + 7, 5, 1, '#9c8b6d');
      level.solids.push({ x, y: pgy - hh, w: 9, h: hh });
    }
  }
  // bones and stones
  bones(g, 980, R(groundAt(level, 980)), rng);
  for (let i = 0; i < 18; i++) {
    const x = rand(rng, 30, width - 30);
    const gy = R(groundAt(level, x));
    const w = randInt(rng, 2, 6);
    rect(g, x, gy - 1, w, 1, '#a8987a');
  }
  // memory markers
  for (const m of level.memories) {
    const gy = R(groundAt(level, m.x));
    rect(g, m.x - 4, gy - 1, 8, 1, '#d9caa9');
    rect(g, m.x - 2, gy - 2, 4, 1, '#e8dcc0');
  }
}

function paintMountain(level, g, rng) {
  const { width, ground } = level;
  const snowNoise = makeNoise1(level.seed + 411);
  for (let x = 0; x < width; x++) {
    const gy = R(ground[x]);
    const sd = 2 + Math.round(Math.abs(fbm1(snowNoise, x * 0.05, 2)) * 5);
    rect(g, x, gy, 1, sd, '#e9f2fb');
    rect(g, x, gy + sd, 1, 2, '#c3d5e8');
    rect(g, x, gy + sd + 2, 1, 6, '#94a7c2');
    rect(g, x, gy + sd + 8, 1, 12, '#3b4761');
    rect(g, x, gy + sd + 20, 1, Math.max(1, H - gy - sd - 20), '#242e42');
  }
  // rock strata
  for (let k = 1; k < 9; k++) {
    for (let x = 0; x < width; x++) {
      const gy = R(ground[x]);
      const y = gy + 10 + k * 5 + Math.sin(x * 0.03 + k * 2.3) * 3;
      if (y > H) continue;
      g.fillStyle = k % 3 === 0 ? 'rgba(190,208,232,0.13)' : 'rgba(8,12,22,0.3)';
      g.fillRect(x, R(y), 1, 1);
    }
  }
  // snow patches and ice glints
  for (let i = 0; i < width * 0.5; i++) {
    const x = rng() * width;
    const gy = R(ground[x | 0]);
    rect(g, x, gy + 3 + rng() * 12, 1, 1, pick(rng, ['#eef6ff', '#b9cde4', '#7f93b4']));
  }
  // cracks
  g.fillStyle = '#141b29';
  for (let i = 0; i < 30; i++) {
    const x = rng() * width;
    const gy = R(ground[x | 0]);
    let cx = x;
    for (let k = 0; k < 14; k++) {
      cx += rand(rng, -1, 1);
      g.fillRect(R(cx), gy + 14 + k, 1, 1);
    }
  }
  // pines along the slope
  for (let i = 0; i < 34; i++) {
    const x = rand(rng, 20, width - 20);
    const gy = R(groundAt(level, x));
    pineTree(g, x, gy, rand(rng, 16, 34), '#16202f', rng, '#cfdff0');
  }
  // ice shards
  for (let i = 0; i < 12; i++) {
    const x = rand(rng, 60, width - 60);
    const gy = R(groundAt(level, x));
    const hh = randInt(rng, 5, 12);
    for (let k = 0; k < hh; k++) {
      const w = Math.max(1, Math.round((1 - k / hh) * 3));
      rect(g, x - w / 2, gy - k, w, 1, '#a9cfe8');
    }
    rect(g, x, gy - hh, 1, hh, '#dff2ff');
    level.lights.push({ x, y: gy - hh / 2, r: 14, color: '#bfe6ff', alpha: 0.16, flicker: 0.4 });
  }
  // cairns
  for (const cx of [860, 1960, 2520]) {
    cairn(g, cx, R(groundAt(level, cx)), rng);
  }
  // boulders
  for (const bx of [700, 1740]) {
    const gy = R(groundAt(level, bx));
    blob(g, bx, gy - 6, 8, 7, '#26303f', rng, '#3a4657');
    rect(g, bx - 5, gy - 12, 9, 1, '#c9dcee');
    level.solids.push({ x: bx - 8, y: gy - 7, w: 16, h: 7 });
  }
  // rock breaking through the snow line
  for (let i = 0; i < 70; i++) {
    const x = rand(rng, 0, width);
    const gy = R(groundAt(level, x));
    const w = randInt(rng, 2, 7);
    for (let k = 0; k < w; k++) {
      const hh = Math.round(Math.sin((k / w) * Math.PI) * rand(rng, 1, 3));
      rect(g, x + k, gy - hh, 1, hh + 1, '#39435a');
    }
  }
  // memory markers
  for (const m of level.memories) {
    const gy = R(groundAt(level, m.x));
    rect(g, m.x - 3, gy - 1, 6, 1, '#dfeaf6');
    rect(g, m.x - 1, gy - 2, 2, 1, '#ffffff');
  }
}

function paintVillage(level, g, rng) {
  const { width, ground } = level;
  const lip = makeNoise1(level.seed + 88);
  for (let x = 0; x < width; x++) {
    const gy = R(ground[x]);
    const jag = Math.round(Math.abs(fbm1(lip, x * 0.09, 2)) * 3);
    rect(g, x, gy - jag, 1, 1, '#4a3c33');
    rect(g, x, gy - jag + 1, 1, 2, '#332922');
    rect(g, x, gy - jag + 3, 1, 4, '#241c18');
    rect(g, x, gy - jag + 7, 1, 9, '#191211');
    rect(g, x, gy - jag + 16, 1, Math.max(1, H - gy + jag - 16), '#100c0b');
  }
  // ash and cinders
  for (let i = 0; i < width * 1.2; i++) {
    const x = rng() * width;
    const gy = R(ground[x | 0]);
    rect(g, x, gy + rng() * 18, 1, 1, pick(rng, ['#6a5d55', '#4b423c', '#8a7a6c', '#2a211d']));
  }
  // embers glowing in the ash
  for (let i = 0; i < 90; i++) {
    const x = rand(rng, 0, width);
    const gy = R(ground[x | 0]);
    const y = gy + rand(rng, 1, 12);
    rect(g, x, y, 1, 1, pick(rng, ['#ff8a3c', '#ffb066', '#a83a12']));
    if (rng() < 0.3) level.lights.push({ x, y, r: rand(rng, 8, 16), color: '#ff8a3c', alpha: 0.16, flicker: 1.2 });
  }
  // charred beams
  for (let i = 0; i < 9; i++) {
    const x = rand(rng, 40, width - 80);
    const gy = R(groundAt(level, x));
    const len = randInt(rng, 18, 46);
    const ang = rand(rng, -0.5, 0.2);
    for (let k = 0; k < len; k++) {
      const bx = x + k;
      const by = gy - 3 + Math.sin(ang) * k + Math.sin(k * 0.3) * 1.2;
      rect(g, bx, by, 1, 2, '#17100e');
    }
    rect(g, x, gy - 4, len, 1, '#2e211c');
  }
  // rubble piles
  for (let i = 0; i < 22; i++) {
    const x = rand(rng, 20, width - 20);
    const gy = R(groundAt(level, x));
    const w = randInt(rng, 3, 10);
    for (let k = 0; k < w; k++) {
      rect(g, x + k, gy - 1 - Math.round(Math.sin((k / w) * Math.PI) * 2), 1, 3, '#241b18');
    }
    // rubble is walkable scenery, not an obstacle
  }
  // broken walls in the walkable plane
  for (const wx of [260, 760]) {
    const gy = R(groundAt(level, wx));
    ruinWall(g, wx, gy, 26, 15, '#2a211d', rng, '#1a1311');
    level.solids.push({ x: wx, y: gy - 15, w: 26, h: 15 });
  }
  // memory markers
  for (const m of level.memories) {
    const gy = R(groundAt(level, m.x));
    rect(g, m.x - 3, gy - 1, 6, 1, '#6d6058');
    rect(g, m.x - 1, gy - 2, 2, 1, '#8a7a6c');
  }
}

function paintCity(level, g, rng) {
  const { width, ground } = level;
  // curb, asphalt and the dark under-street
  for (let x = 0; x < width; x++) {
    const gy = R(ground[x]);
    rect(g, x, gy, 1, 2, '#3c3b47');
    rect(g, x, gy + 2, 1, 2, '#25242e');
    rect(g, x, gy + 4, 1, 9, '#191922');
    rect(g, x, gy + 13, 1, 12, '#12121a');
    rect(g, x, gy + 25, 1, Math.max(1, H - gy - 25), '#0a0a10');
  }
  // asphalt grain, tyre marks, patched cracks
  for (let i = 0; i < width * 1.1; i++) {
    const x = rng() * width;
    const gy = R(ground[x | 0]);
    rect(g, x, gy + 4 + rng() * 30, 1, 1, pick(rng, ['#20202a', '#15151d', '#2b2b36', '#0e0e15']));
  }
  for (let i = 0; i < 30; i++) {
    const x = rand(rng, 20, width - 20);
    const gy = R(ground[x | 0]);
    g.fillStyle = '#0d0d14';
    let cx = x;
    for (let k = 0; k < 18; k++) {
      cx += rand(rng, -0.8, 0.8);
      g.fillRect(R(cx), gy + 6 + k * 0.6, 1, 1);
    }
  }
  // wet reflections of the windows above
  for (let i = 0; i < 34; i++) {
    const x = rand(rng, 30, width - 30);
    const gy = R(groundAt(level, x));
    const w = randInt(rng, 8, 24);
    g.fillStyle = pick(rng, ['rgba(96,126,178,0.22)', 'rgba(178,128,96,0.16)', 'rgba(120,150,190,0.14)']);
    g.fillRect(R(x - w / 2), gy + 5, w, 1);
    g.fillRect(R(x - w / 2) + 2, gy + 6, Math.max(1, w - 5), 1);
  }
  // drain grates and manholes
  for (let i = 0; i < 9; i++) {
    const x = rand(rng, 40, width - 40);
    const gy = R(groundAt(level, x));
    rect(g, x, gy + 2, 7, 2, '#0b0b11');
    rect(g, x + 1, gy + 2, 1, 1, '#22222c');
    rect(g, x + 4, gy + 2, 1, 1, '#22222c');
  }
  // street lamps with warm cones of light
  for (let x = 150; x < width - 110; x += 300) {
    const gy = R(groundAt(level, x));
    rect(g, x, gy - 48, 1, 48, '#1a1b23');
    rect(g, x, gy - 48, 7, 1, '#1a1b23');
    rect(g, x + 5, gy - 47, 3, 2, '#343440');
    rect(g, x + 6, gy - 45, 1, 1, '#ffe6b4');
    level.lights.push({ x: x + 6, y: gy - 43, r: 46, color: '#ffcf8e', alpha: 0.2, flicker: 0.8 });
  }
  // power lines drooping between the poles
  g.fillStyle = '#0b0c12';
  for (let x = 150; x < width - 110; x += 300) {
    for (let k = 0; k < 300; k++) {
      const y = 30 + Math.sin((k / 300) * Math.PI) * 16 + Math.sin(k * 0.12) * 0.8;
      g.fillRect(R(x + k), R(y), 1, 1);
    }
    g.fillRect(R(x + 2), R(30), 1, 22);
    g.fillRect(R(x + 298), R(30), 1, 22);
  }
  // wrecked cars left in the road
  for (const cx of [560, 1240, 1640]) {
    const gy = R(groundAt(level, cx));
    const w = 40;
    rect(g, cx - w / 2, gy - 9, w, 9, '#191a24');
    rect(g, cx - w / 2 + 7, gy - 15, w - 15, 6, '#151620');
    rect(g, cx - w / 2 + 9, gy - 14, 8, 4, 'rgba(130,160,200,0.22)');
    rect(g, cx + 4, gy - 14, 9, 4, 'rgba(130,160,200,0.16)');
    rect(g, cx - w / 2, gy - 9, w, 1, '#2b2d3a');
    rect(g, cx - w / 2 + 3, gy - 8, 3, 2, '#3a2a2a');
    disc(g, cx - 12, gy - 1, 4, '#0a0a10');
    disc(g, cx + 12, gy - 1, 4, '#0a0a10');
  }
  // rubbish, a hydrant, a sign with no message left on it
  for (let i = 0; i < 26; i++) {
    const x = rand(rng, 20, width - 20);
    const gy = R(groundAt(level, x));
    const w = randInt(rng, 2, 6);
    const h = randInt(rng, 1, 3);
    rect(g, x, gy - h, w, h, pick(rng, ['#1b1b24', '#23232c', '#141419']));
  }
  {
    const x = 980;
    const gy = R(groundAt(level, x));
    rect(g, x, gy - 7, 3, 7, '#4a2a2a');
    rect(g, x - 1, gy - 5, 5, 1, '#5a3434');
    rect(g, x, gy - 8, 3, 1, '#5a3434');
  }
  {
    const x = 1360;
    const gy = R(groundAt(level, x));
    rect(g, x, gy - 34, 1, 34, '#1c1d26');
    rect(g, x - 6, gy - 40, 13, 7, '#20222c');
    rect(g, x - 4, gy - 38, 7, 1, 'rgba(200,210,230,0.25)');
  }
}

// The stone that trades a memory for a power, painted under the sigil.
function paintShrine(level, g, rng) {
  const p = level.power;
  if (!p) return;
  const gy = R(groundAt(level, p.x));
  rect(g, p.x - 12, gy - 3, 24, 3, '#2b2934');
  rect(g, p.x - 12, gy - 3, 24, 1, '#4b4859');
  rect(g, p.x - 8, gy - 6, 16, 3, '#35323f');
  rect(g, p.x - 8, gy - 6, 16, 1, '#545063');
  rect(g, p.x - 5, gy - 9, 10, 3, '#403d4c');
  rect(g, p.x - 5, gy - 9, 10, 1, '#5f5a70');
  rect(g, p.x - 1, gy - 26, 2, 17, '#2a2833');
  rect(g, p.x - 7, gy - 25, 14, 1, '#2a2833');
  rect(g, p.x - 6, gy - 22, 12, 1, '#33303d');
  for (let i = 0; i < 4; i++) {
    rect(g, p.x - 9 + i * 5, gy - 1, 3, 1, rgba(p.color, 0.5));
  }
  level.lights.push({ x: p.x, y: gy - 24, r: 30, color: p.color, alpha: 0.2, flicker: 0.5 });
}

function paintTerrain(level, g, rng) {
  switch (level.theme) {
    case 'forest': paintForest(level, g, rng); break;
    case 'desert': paintDesert(level, g, rng); break;
    case 'mountain': paintMountain(level, g, rng); break;
    case 'city': paintCity(level, g, rng); break;
    default: paintVillage(level, g, rng); break;
  }
  if (level.power) paintShrine(level, g, rng);
}

// ---------- parallax layers ------------------------------------------------

function layerCanvas(level, factor, seed, painter) {
  const w = Math.ceil(W + level.width * factor) + 4;
  const c = makeCanvas(w, H);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  painter(g, w, H, mulberry32(seed));
  return { canvas: c, factor };
}

function aurora(g, w, y0, amp, color, alpha, seed) {
  const noise = makeNoise1(seed);
  for (let x = 0; x < w; x++) {
    const yc = y0 + fbm1(noise, x * 0.004, 2) * amp + Math.sin(x * 0.006) * amp * 0.5;
    for (let d = -30; d <= 30; d++) {
      const a = (1 - Math.abs(d) / 30);
      g.fillStyle = rgba(color, a * a * alpha);
      g.fillRect(x, R(yc + d), 1, 1);
    }
  }
}

function buildForestLayers(level) {
  const far = layerCanvas(level, 0.09, level.seed + 11, (g, w, h, rng) => {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      g.fillStyle = mix('#0a1420', '#1a3040', Math.pow(t, 1.4));
      g.fillRect(0, y, w, 1);
    }
    // moon
    const mx = Math.min(w - 90, 150);
    const my = 72;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let r = 88; r > 12; r -= 4) disc(g, mx, my, r, 'rgba(150,190,215,0.010)');
    g.restore();
    disc(g, mx, my, 17, '#e2ecf3');
    disc(g, mx - 3, my - 3, 14, '#e8f1f6');
    g.fillStyle = 'rgba(150,170,190,0.35)';
    g.fillRect(mx - 6, my + 2, 5, 4);
    g.fillRect(mx + 3, my - 6, 4, 3);
    g.fillRect(mx - 1, my + 8, 3, 2);
    // mist band at the horizon
    for (let y = 130; y < 210; y++) {
      const a = Math.sin(((y - 130) / 80) * Math.PI) * 0.16;
      g.fillStyle = `rgba(140,190,205,${a})`;
      g.fillRect(0, y, w, 1);
    }
    // distant tree line: two rows of proper conifer silhouettes
    for (let pass = 0; pass < 2; pass++) {
      const base = pass === 0 ? 188 : 196;
      const tint = pass === 0 ? 'rgba(12,26,34,0.7)' : 'rgba(8,18,26,0.92)';
      for (let x = -14; x < w + 14; x += randInt(rng, 11, 26)) {
        const hh = rand(rng, pass === 0 ? 22 : 38, pass === 0 ? 48 : 86);
        const baseY = base + Math.sin(x * 0.015) * 5;
        const halfW = hh * rand(rng, 0.12, 0.2);
        g.fillStyle = tint;
        for (let k = 0; k < hh; k++) {
          const ww = Math.max(1, Math.round(halfW * (1 - k / hh)));
          g.fillRect(x - ww, R(baseY - k), ww * 2, 1);
        }
        g.fillRect(x - 1, R(baseY), 2, 8);
      }
    }
    // fog over the far trunks
    for (let y = 150; y < 200; y++) {
      const a = (1 - Math.abs((y - 175) / 25)) * 0.12;
      if (a > 0) {
        g.fillStyle = `rgba(120,170,190,${a})`;
        g.fillRect(0, y, w, 1);
      }
    }
  });

  const mid = layerCanvas(level, 0.3, level.seed + 23, (g, w, h, rng) => {
    for (let x = -20; x < w + 20; x += randInt(rng, 18, 46)) {
      if (rng() < 0.18) continue;
      const hh = rand(rng, 54, 138);
      const baseY = 220 + Math.sin(x * 0.01) * 8;
      treeSilhouette(g, x, baseY, hh, 'rgba(7,16,22,0.95)', rng, 1.1);
    }
    for (let i = 0; i < w / 90; i++) {
      const x = rng() * w;
      treeSilhouette(g, x, 224, rand(rng, 26, 52), 'rgba(5,12,18,0.9)', rng, 0.8);
    }
    // ground haze
    for (let y = 190; y < h; y++) {
      const a = ((y - 190) / 80) * 0.5;
      g.fillStyle = `rgba(8,20,26,${a})`;
      g.fillRect(0, y, w, 1);
    }
  });

  return [far, mid];
}

function buildDesertLayers(level) {
  const far = layerCanvas(level, 0.07, level.seed + 31, (g, w, h, rng) => {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      g.fillStyle = t < 0.52
        ? mix('#20213c', '#6a5570', Math.pow(t / 0.52, 1.25))
        : mix('#6a5570', '#e2cbaa', Math.pow((t - 0.52) / 0.48, 0.85));
      g.fillRect(0, y, w, 1);
    }
    // pale sun
    const sx = Math.min(w - 80, 250);
    const sy = 108;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let r = 118; r > 18; r -= 5) disc(g, sx, sy, r, 'rgba(255,228,190,0.014)');
    g.restore();
    disc(g, sx, sy, 22, '#fbeed8');
    disc(g, sx, sy, 19, '#fff8ea');
    // haze
    for (let y = 118; y < 200; y++) {
      const a = Math.sin(((y - 118) / 82) * Math.PI) * 0.14;
      g.fillStyle = `rgba(255,238,214,${a})`;
      g.fillRect(0, y, w, 1);
    }
    // dune ridges: far, middle, near — smooth crests with soft shadow
    const ridges = [
      { base: 164, amp: 11, f: 0.0042, col: '#c8ae92', crest: 'rgba(255,248,230,0.55)' },
      { base: 178, amp: 14, f: 0.0059, col: '#bda084', crest: 'rgba(255,248,230,0.45)' },
      { base: 192, amp: 10, f: 0.0088, col: '#b0947a', crest: 'rgba(255,248,230,0.35)' },
    ];
    for (const rg of ridges) {
      for (let x = 0; x < w; x++) {
        const y = rg.base + Math.sin(x * rg.f) * rg.amp + Math.sin(x * rg.f * 2.4 + 2.1) * rg.amp * 0.4;
        const yy = R(y);
        g.fillStyle = rg.col;
        g.fillRect(x, yy, 1, h - yy);
        g.fillStyle = rg.crest;
        g.fillRect(x, yy, 1, 1);
        for (let k = 1; k < 18; k++) {
          g.fillStyle = `rgba(112,92,70,${0.10 * (1 - k / 18)})`;
          g.fillRect(x, yy + k, 1, 1);
        }
      }
    }
    // receding forest silhouette (left edge only)
    for (let x = 0; x < 300; x++) {
      const fade = clamp(1 - x / 300, 0, 1);
      if (rng() < 0.4) continue;
      const hh = (26 + Math.abs(Math.sin(x * 0.14)) * 40) * fade;
      g.fillStyle = `rgba(40,36,48,${0.55 * fade})`;
      for (let k = 0; k < hh; k++) {
        const ww = Math.max(1, Math.round((1 - k / Math.max(1, hh)) * 3));
        g.fillRect(x, R(214 - k), ww, 1);
      }
    }
  });

  const mid = layerCanvas(level, 0.26, level.seed + 47, (g, w, h, rng) => {
    const ridges = [
      { base: 206, amp: 16, f: 0.0062, col: '#a98d70', crest: 'rgba(255,248,232,0.5)' },
      { base: 222, amp: 13, f: 0.0095, col: '#9a7f66', crest: 'rgba(255,248,232,0.4)' },
    ];
    for (const rg of ridges) {
      for (let x = 0; x < w; x++) {
        const y = rg.base + Math.sin(x * rg.f) * rg.amp + Math.sin(x * rg.f * 2.7 + 1.3) * rg.amp * 0.35;
        const yy = R(y);
        g.fillStyle = rg.col;
        g.fillRect(x, yy, 1, h - yy);
        g.fillStyle = rg.crest;
        g.fillRect(x, yy, 1, 1);
        for (let k = 1; k < 14; k++) {
          g.fillStyle = `rgba(110,88,66,${0.09 * (1 - k / 14)})`;
          g.fillRect(x, yy + k, 1, 1);
        }
      }
    }
    // sparse dead shrubs on the near crest
    for (let i = 0; i < w / 210; i++) {
      const x = rng() * w;
      const y = 222 + Math.sin(x * 0.0095) * 13;
      branch(g, x, y, -1.5, 6, 1, 'rgba(116,92,70,0.5)', rng, 0);
    }
  });

  return [far, mid];
}

function buildMountainLayers(level) {
  const far = layerCanvas(level, 0.08, level.seed + 53, (g, w, h, rng) => {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      g.fillStyle = mix('#060b18', '#16243c', Math.pow(t, 0.9));
      g.fillRect(0, y, w, 1);
    }
    aurora(g, w, 62, 22, '#6fe0d8', 0.1, level.seed + 3);
    aurora(g, w, 84, 30, '#8f7fe0', 0.075, level.seed + 9);
    // stars
    for (let i = 0; i < 90; i++) {
      const x = rng() * w;
      const y = rng() * 120;
      g.fillStyle = `rgba(220,235,255,${0.2 + rng() * 0.6})`;
      g.fillRect(R(x), R(y), 1, 1);
    }
    // jagged peaks
    const peaks = [
      [0.0, '#101a2c'], [1.0, '#16233a'],
    ];
    for (let layer = 0; layer < 2; layer++) {
      const baseY = 208 - layer * 16;
      const amp = 46 - layer * 12;
      const col = peaks[layer][1];
      const noise = makeNoise1(level.seed + layer * 17);
      for (let x = 0; x < w; x++) {
        const y = baseY - Math.abs(fbm1(noise, x * 0.006 + layer * 5, 3)) * amp - Math.sin(x * 0.008) * 12;
        g.fillStyle = col;
        g.fillRect(x, R(y), 1, h - R(y));
        // snow caps
        if (y < baseY - amp * 0.42) {
          g.fillStyle = 'rgba(214,232,250,0.5)';
          g.fillRect(x, R(y), 1, 2);
        }
      }
    }
    // valley fog
    for (let y = 180; y < h; y++) {
      const a = ((y - 180) / 90) * 0.35;
      g.fillStyle = `rgba(160,190,220,${a})`;
      g.fillRect(0, y, w, 1);
    }
  });

  const mid = layerCanvas(level, 0.3, level.seed + 61, (g, w, h, rng) => {
    const noise = makeNoise1(level.seed + 5);
    for (let x = 0; x < w; x++) {
      const y = 220 - Math.abs(fbm1(noise, x * 0.012, 2)) * 40;
      g.fillStyle = '#0e1826';
      g.fillRect(x, R(y), 1, h - R(y));
      g.fillStyle = 'rgba(170,200,230,0.22)';
      g.fillRect(x, R(y), 1, 1);
    }
    for (let i = 0; i < w / 34; i++) {
      const x = rng() * w;
      const y = 214 - Math.abs(fbm1(noise, x * 0.012, 2)) * 34;
      pineTree(g, x, y + 8, rand(rng, 14, 30), '#080f1a', rng, 'rgba(180,210,240,0.5)');
    }
  });

  return [far, mid];
}

function buildVillageLayers(level) {
  const far = layerCanvas(level, 0.1, level.seed + 71, (g, w, h, rng) => {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      g.fillStyle = mix('#0a0810', '#2a1720', Math.pow(t, 1.15));
      g.fillRect(0, y, w, 1);
    }
    for (let y = 130; y < h; y++) {
      const t = (y - 130) / (h - 130);
      g.fillStyle = `rgba(126,44,24,${0.26 * Math.pow(t, 1.9)})`;
      g.fillRect(0, y, w, 1);
    }
    // thin smoke veils
    for (let i = 0; i < 60; i++) {
      const x = rng() * w;
      const y = 70 + rng() * 140;
      const r = 14 + rng() * 34;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(26,15,17,0.09)');
      grad.addColorStop(1, 'rgba(26,15,17,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // distant hills
    const noise = makeNoise1(level.seed + 2);
    for (let x = 0; x < w; x++) {
      const y = 208 - Math.abs(fbm1(noise, x * 0.007, 2)) * 26;
      g.fillStyle = '#150d12';
      g.fillRect(x, R(y), 1, h - R(y));
    }
    // the ember glow above the valley
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gl = g.createLinearGradient(0, 200, 0, 268);
    gl.addColorStop(0, 'rgba(255,120,50,0.0)');
    gl.addColorStop(0.55, 'rgba(255,110,45,0.30)');
    gl.addColorStop(1, 'rgba(255,80,30,0.12)');
    g.fillStyle = gl;
    g.fillRect(0, 190, w, 80);
    g.restore();
  });

  const mid = layerCanvas(level, 0.34, level.seed + 83, (g, w, h, rng) => {
    const baseY = 232;
    // village floor
    for (let x = 0; x < w; x++) {
      const y = baseY + Math.sin(x * 0.02) * 2;
      g.fillStyle = '#120b0d';
      g.fillRect(x, R(y), 1, h - R(y));
    }
    // ruined houses
    let x = 4;
    while (x < w - 10) {
      const ww = randInt(rng, 13, 30);
      const hh = randInt(rng, 9, 24);
      const y = baseY - 2 + Math.sin(x * 0.02) * 2;
      if (rng() < 0.82) {
        // collapsed roof line, faintly lit by the fires beyond
        const col = pick(rng, ['#3b2628', '#46302f', '#301e21']);
        for (let i = 0; i < ww; i++) {
          const roofSlope = Math.round((1 - Math.abs(i - ww / 2) / (ww / 2)) * hh * 0.28);
          const top = y - hh + roofSlope + Math.round(Math.sin(i * 0.8 + x) * 1.2);
          g.fillStyle = col;
          g.fillRect(x + i, top, 1, y - top);
          g.fillStyle = 'rgba(196,104,62,0.42)';
          g.fillRect(x + i, top, 1, 1);
          if (i % 3 === 0) {
            g.fillStyle = 'rgba(96,56,44,0.16)';
            g.fillRect(x + i, top + 2, 1, 2);
          }
        }
        // rafters
        g.fillStyle = '#2b1d1c';
        for (let i = 0; i < 3; i++) {
          const rx = x + 2 + i * (ww / 3);
          for (let k = 0; k < 5; k++) g.fillRect(R(rx + k * 0.6), R(y - hh + 2 + k), 1, 1);
        }
        // dark windows
        g.fillStyle = '#080507';
        if (rng() < 0.7) g.fillRect(x + Math.floor(ww * 0.3), y - hh + Math.floor(hh * 0.45), 3, 3);
        // ember glow in a few doorways
        if (rng() < 0.3) {
          const fx = x + ww * 0.6;
          const fy = y - 3;
          const grad = g.createRadialGradient(fx, fy, 0, fx, fy, 14);
          grad.addColorStop(0, 'rgba(255,120,50,0.30)');
          grad.addColorStop(1, 'rgba(255,90,30,0)');
          g.fillStyle = grad;
          g.fillRect(fx - 14, fy - 14, 28, 28);
          level.valleyFires.push({ lx: fx, ly: fy - hh * 0.35, r: 10 + rng() * 8, phase: rng() * 10 });
        }
      }
      x += ww + randInt(rng, 2, 10);
    }
    // a broken tower for a landmark
    {
      const tx = w * 0.46;
      const th = 44;
      const ty = baseY - 4;
      for (let i = 0; i < 9; i++) {
        const bh = th - i * 3;
        g.fillStyle = '#2a1a1e';
        for (let yy = 0; yy < bh; yy++) {
          const jag = Math.sin(yy * 0.9 + i) * 1.4;
          g.fillRect(R(tx + i + jag), R(ty - bh), 1, bh);
        }
        g.fillStyle = 'rgba(178,92,58,0.32)';
        g.fillRect(R(tx + i), R(ty - bh), 1, 1);
      }
      // fallen spire
      for (let k = 0; k < 26; k++) {
        g.fillStyle = '#1c1216';
        g.fillRect(R(tx + 10 + k), R(ty - 40 + k * 1.1), 2, 2);
      }
    }
    // collapsed streets and rubble along the valley floor
    for (let i = 0; i < 44; i++) {
      const rx = rng() * w;
      const rw = randInt(rng, 6, 24);
      const rh = randInt(rng, 1, 3);
      g.fillStyle = '#261718';
      for (let k = 0; k < rw; k++) {
        const hh = Math.round(Math.sin((k / rw) * Math.PI) * rh);
        g.fillRect(R(rx + k), R(baseY - hh), 1, hh + 1);
      }
    }
    // drifting smoke columns
    for (let i = 0; i < 8; i++) {
      const sx = rng() * w;
      for (let k = 0; k < 70; k++) {
        const a = 0.05 * (1 - k / 70);
        g.fillStyle = `rgba(60,48,48,${a})`;
        const px = sx + Math.sin(k * 0.12 + i) * (4 + k * 0.18);
        g.fillRect(R(px), R(baseY - 20 - k), 3 + Math.floor(k / 18), 1);
      }
    }
    // fog swallowing the base of the valley
    for (let y = 198; y < h; y++) {
      const a = clamp((y - 198) / 72, 0, 1);
      g.fillStyle = `rgba(20,12,15,${a * a * 0.46})`;
      g.fillRect(0, y, w, 1);
    }
  });

  return [far, mid];
}

function buildCityLayers(level) {
  const far = layerCanvas(level, 0.08, level.seed + 91, (g, w, h, rng) => {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      g.fillStyle = t < 0.6
        ? mix('#04050b', '#101728', Math.pow(t / 0.6, 1.6))
        : mix('#101728', '#2b2b3e', (t - 0.6) / 0.4);
      g.fillRect(0, y, w, 1);
    }
    // the city throws its own light at the clouds
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gl = g.createLinearGradient(0, 146, 0, 212);
    gl.addColorStop(0, 'rgba(255,150,90,0)');
    gl.addColorStop(0.72, 'rgba(255,140,80,0.11)');
    gl.addColorStop(1, 'rgba(255,120,60,0.02)');
    g.fillStyle = gl;
    g.fillRect(0, 146, w, 66);
    g.restore();
    // a small moon behind moving cloud
    const mx = Math.min(w - 80, 116);
    const my = 50;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let r = 74; r > 12; r -= 5) disc(g, mx, my, r, 'rgba(180,200,230,0.008)');
    g.restore();
    disc(g, mx, my, 13, '#d6e0ec');
    disc(g, mx - 4, my - 3, 9, '#e7eef7');
    // low cloud bars
    for (let i = 0; i < 30; i++) {
      const cx = rng() * w;
      const cy = 18 + rng() * 96;
      const cw = 28 + rng() * 96;
      g.fillStyle = `rgba(28,36,56,${0.10 + rng() * 0.2})`;
      g.fillRect(R(cx), R(cy), R(cw), 2 + Math.round(rng() * 3));
    }
    // three rows of skyline towers, each with its own little lights
    for (let row = 0; row < 3; row++) {
      const baseY = 206 - row * 7;
      const col = ['#0b0f19', '#0e1320', '#121828'][row];
      let x = -12;
      while (x < w + 12) {
        const bw = randInt(rng, 18, 54);
        const bh = rand(rng, 40, 96) - row * 9;
        const top = baseY - bh;
        g.fillStyle = col;
        g.fillRect(R(x), R(top), bw, R(baseY - top));
        if (rng() < 0.5) g.fillRect(R(x + bw * 0.3), R(top - 7), 1, 7);
        if (rng() < 0.3) g.fillRect(R(x + bw * 0.62), R(top - 4), 4, 1);
        for (let wy = top + 5; wy < baseY - 6; wy += 5) {
          for (let wx = x + 3; wx < x + bw - 4; wx += 4) {
            if (rng() < 0.4) {
              g.fillStyle = rng() < 0.7 ? 'rgba(255,214,150,0.5)' : 'rgba(150,200,255,0.45)';
              g.fillRect(R(wx), R(wy), 1, 2);
            }
          }
        }
        x += bw + randInt(rng, 2, 12);
      }
    }
    for (let y = 150; y < h; y++) {
      const a = clamp((y - 150) / 80, 0, 1) * 0.38;
      g.fillStyle = `rgba(9,11,19,${a})`;
      g.fillRect(0, y, w, 1);
    }
  });

  const mid = layerCanvas(level, 0.3, level.seed + 97, (g, w, h, rng) => {
    const baseY = 236;
    for (let x = 0; x < w; x++) {
      g.fillStyle = '#080a10';
      g.fillRect(x, baseY, 1, h - baseY);
    }
    let x = -8;
    while (x < w + 8) {
      const bw = randInt(rng, 46, 98);
      const bh = rand(rng, 54, 122);
      const top = baseY - bh;
      g.fillStyle = pick(rng, ['#14161f', '#191a24', '#11131b']);
      g.fillRect(R(x), R(top), bw, R(bh));
      // water tank or AC units on the roof
      if (rng() < 0.6) {
        g.fillStyle = '#0d0f16';
        g.fillRect(R(x + bw * 0.5), R(top - 10), 8, 10);
        g.fillRect(R(x + bw * 0.5) - 1, R(top - 11), 10, 1);
      }
      // window grid, some of them still home to someone
      for (let wy = top + 6; wy < baseY - 12; wy += 8) {
        for (let wx = x + 4; wx < x + bw - 6; wx += 7) {
          const lit = rng();
          if (lit < 0.28) {
            g.fillStyle = rng() < 0.75
              ? `rgba(255,206,140,${0.5 + rng() * 0.35})`
              : `rgba(160,200,255,${0.4 + rng() * 0.3})`;
            g.fillRect(R(wx), R(wy), 3, 3);
          } else if (lit < 0.48) {
            g.fillStyle = 'rgba(28,32,44,0.9)';
            g.fillRect(R(wx), R(wy), 3, 3);
          }
        }
      }
      // balconies
      if (rng() < 0.5) {
        for (let by = top + 16; by < baseY - 14; by += 12) {
          g.fillStyle = '#0b0d13';
          g.fillRect(R(x + 3), R(by), bw - 6, 1);
          g.fillStyle = 'rgba(58,64,84,0.5)';
          g.fillRect(R(x + 3), R(by - 3), 1, 3);
          g.fillRect(R(x + bw - 4), R(by - 3), 1, 3);
        }
      }
      // fire escapes
      if (rng() < 0.35) {
        for (let fy = top + 14; fy < baseY - 12; fy += 11) {
          g.fillStyle = '#0a0b10';
          for (let k = 0; k < 12; k++) g.fillRect(R(x + bw - 17 + k), R(fy), 1, 1);
          for (let k = 0; k < 9; k++) g.fillRect(R(x + bw - 15), R(fy - k), 1, 1);
        }
      }
      // a neon sign, still burning
      if (rng() < 0.3) {
        const sy = top + 10 + rng() * (bh * 0.4);
        const scol = pick(rng, ['#ff4d6d', '#4dd2ff', '#ffd166', '#8f7bff']);
        g.fillStyle = rgba(scol, 0.72);
        g.fillRect(R(x + 2), R(sy), 2, 12);
        g.fillRect(R(x + 6), R(sy + 2), 2, 8);
        g.fillRect(R(x + 10), R(sy + 4), 2, 4);
      }
      x += bw + randInt(rng, 4, 16);
    }
    for (let yy = 200; yy < h; yy++) {
      const a = clamp((yy - 200) / 40, 0, 1) * 0.5;
      g.fillStyle = `rgba(6,7,11,${a})`;
      g.fillRect(0, yy, w, 1);
    }
  });

  return [far, mid];
}

function paintVillageForeground(g, level, rng) {
  // dark cliff teeth framing the drop, plus ash drifts
  for (let i = 0; i < 5; i++) {
    const x = rand(rng, 0, level.width);
    const w = randInt(rng, 12, 30);
    const hh = randInt(rng, 6, 16);
    for (let k = 0; k < w; k++) {
      const dh = Math.round(Math.sin((k / w) * Math.PI) * hh);
      g.fillStyle = '#08060a';
      g.fillRect(x + k, H - dh, 1, dh);
    }
  }
  for (let i = 0; i < level.width * 0.5; i++) {
    const x = rng() * level.width;
    g.fillStyle = `rgba(120,110,100,${rng() * 0.25})`;
    g.fillRect(R(x), R(H - 1 - rng() * 3), 1, 1);
  }
}

// ---------- assembly -------------------------------------------------------

export function buildLevel(index) {
  const cfg = CONFIGS[clamp(index, 0, CONFIGS.length - 1)];
  const rng = mulberry32(cfg.seed);
  const level = {
    index,
    id: cfg.id,
    numeral: cfg.numeral,
    name: cfg.name,
    theme: cfg.theme,
    width: cfg.width,
    spawnX: cfg.spawnX,
    exitX: cfg.exitX,
    points: cfg.points,
    ground: buildGround(cfg.width, cfg.points, cfg.amp, cfg.seed),
    lights: [],
    solids: [],
    valleyFires: [],
    memories: cfg.memories.map((m) => ({ ...m })),
    power: cfg.power ? { ...cfg.power } : null,
    arenaX: cfg.theme === 'city' ? 1852 : null,
    teens: cfg.theme === 'city' ? CITY_TEENS.map((t) => ({ ...t })) : null,
  };
  for (const m of level.memories) m.y = groundAt(level, m.x) - 25;
  if (level.power) level.power.y = groundAt(level, level.power.x);

  const canvas = makeCanvas(cfg.width, H);
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  paintTerrain(level, g, rng);
  level.canvas = canvas;

  switch (level.theme) {
    case 'forest': level.layers = buildForestLayers(level); break;
    case 'desert': level.layers = buildDesertLayers(level); break;
    case 'mountain': level.layers = buildMountainLayers(level); break;
    case 'city': level.layers = buildCityLayers(level); break;
    default: level.layers = buildVillageLayers(level); break;
  }

  if (level.theme === 'village') {
    const fg = makeCanvas(cfg.width, H);
    const fgc = fg.getContext('2d');
    paintVillageForeground(fgc, level, mulberry32(cfg.seed + 199));
    level.foreground = fg;
  } else {
    level.foreground = null;
  }

  return level;
}
