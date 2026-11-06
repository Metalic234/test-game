// THE LAST JOURNEY — game loop, player, guardians, atmosphere, cinematics.

import {
  W, H, TAU, clamp, lerp, damp, rgba, mix, vgrad, glow, disc, makeCanvas, hash1,
} from './util.js';
import { drawText, wrapText, textWidth } from './font.js';
import { GIRL, GIRL_SIT, drawGuardian, drawWisp, drawTeen, drawShield } from './sprites.js';
import { buildLevel, groundAt, TOTAL_MEMORIES, LEVEL_COUNT } from './levels.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';

const SPEED = 78;
const GRAV = 330;
const JUMP = 114;
const MAXFALL = 300;
const PW = 6; // player body width
const PH = 18; // player body height
const DASH_SPEED = 250;
const DASH_TIME = 0.18;
const DASH_COOLDOWN = 0.75;

const SKY = {
  forest: [[0, '#04070e'], [0.35, '#0a1420'], [0.7, '#152838'], [1, '#1e3843']],
  desert: [[0, '#1d2038'], [0.4, '#4a4054'], [0.72, '#8b7280'], [1, '#c9ac93']],
  mountain: [[0, '#050a16'], [0.4, '#101d33'], [0.75, '#1b2c46'], [1, '#2b4059']],
  village: [[0, '#05040a'], [0.35, '#140c14'], [0.65, '#2a1116'], [1, '#4a1a14']],
  city: [[0, '#03040a'], [0.4, '#0a0f1c'], [0.72, '#161d2e'], [1, '#2c2c3e']],
};

const MIST = {
  forest: { color: '#7fb6b6', alpha: 0.055, y: 150, h: 100 },
  desert: { color: '#ffe6c4', alpha: 0.06, y: 160, h: 90 },
  mountain: { color: '#cfe2f4', alpha: 0.075, y: 120, h: 130 },
  village: { color: '#a06a58', alpha: 0.05, y: 140, h: 120 },
  city: { color: '#8fa6c8', alpha: 0.045, y: 150, h: 110 },
};

// The three powers she can buy from the stones, and the colour of each.
const POWERS = [
  { id: 'leap', name: 'LEAP', color: '#7fe0a4' },
  { id: 'glide', name: 'GLIDE', color: '#bfe6ff' },
  { id: 'dash', name: 'DASH', color: '#ffb066' },
];
// Moments where a shadow steps ahead of her and refuses to let her pass —
// it stoops close, holds for a breath, then withdraws.
const BEATS = [
  { x: 560, line: 'IT STOPS HER. FOR A MOMENT THE FOREST IS VERY QUIET.' },
  { x: 1900, line: 'HERE, ONCE, THERE WAS A ROAD.' },
  { x: 1600, line: 'THE COLD REMEMBERS HER BETTER THAN SHE DOES.' },
  { x: 880, line: 'THEY DO NOT WANT HER TO SEE THE VALLEY YET.' },
  { x: 900, line: 'THE CITY DOES NOT SLEEP. IT WAITS.' },
];

function makeVignette() {
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(W * 0.5, H * 0.52, H * 0.3, W * 0.5, H * 0.52, H * 0.92);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.26)');
  grad.addColorStop(1, 'rgba(0,0,0,0.88)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  return c;
}

function makeGrain(seed) {
  const c = makeCanvas(180, 150);
  const g = c.getContext('2d');
  const img = g.createImageData(180, 150);
  let s = seed;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 16) & 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 26 + ((s >> 8) & 15);
  }
  g.putImageData(img, 0, 0);
  return c;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.input = new Input();
    this.audio = new AudioEngine();

    this.mode = 'title';
    this.time = 0;
    this.titleT = 0;
    this.level = null;
    this.levelIndex = 0;
    this.found = new Set();
    this.nearby = null;
    this.note = null;
    this.card = null;
    this.hintT = 0;
    this.paused = false;
    this.fade = 0;
    this.fadeTarget = 0;
    this.frozen = true;
    this.finale = null;
    this.bossBattle = null;
    this.ending = null;
    this.powers = new Set();
    this.memory = 0;
    this.nearPower = null;
    this.dashT = 0;
    this.dashCd = 0;
    this.memorySurge = null;
    this.timeline = null;
    this.beats = [];
    this.blocker = null;
    this.mutedNotice = 0;
    this.bob = 0;

    this.cam = { x: 0, y: 0 };
    this.player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1, onGround: true, anim: 0, stepT: 0 };
    this.guardians = [];
    this.particles = [];
    this.vignette = makeVignette();
    this.grain = [makeGrain(12345), makeGrain(98765)];
    this.lastStepAt = 0;

    this.loadTitleScene();
  }

  // ---------------------------------------------------------------- setup
  loadTitleScene() {
    this.level = buildLevel(0);
    const px = 940;
    this.player = {
      x: px, y: groundAt(this.level, px), vx: 0, vy: 0, facing: 1, onGround: true, anim: 0, stepT: 0,
    };
    this.cam.x = clamp(px - W * 0.44, 0, this.level.width - W);
    this.guardians = this.makeGuardians(px);
    this.particles.length = 0;
    this.titleT = 0;
  }

  makeGuardians(px) {
    const gy = (x) => groundAt(this.level, x);
    return [
      {
        x: px - 52, y: gy(px - 52) - 22, off: 52, hover: 22, hoverCur: 22,
        phase: 0.7, ember: 0, lean: 0, hesitate: 0, blockX: 0,
      },
      {
        x: px - 104, y: gy(px - 104) - 36, off: 104, hover: 36, hoverCur: 36,
        phase: 2.4, ember: 0, lean: 0, hesitate: 0, blockX: 0,
      },
    ];
  }

  loadLevel(index) {
    this.levelIndex = index;
    this.level = buildLevel(index);
    const p = this.level.spawnX;
    this.player = {
      x: p,
      y: groundAt(this.level, p),
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      anim: 0,
      stepT: 0,
    };
    this.cam.x = clamp(p - W * 0.4, 0, Math.max(0, this.level.width - W));
    this.guardians = this.makeGuardians(p);
    this.particles.length = 0;
    this.nearby = null;
    this.nearPower = null;
    this.finale = null;
    this.bossBattle = null;
    this.dashT = 0;
    this.dashCd = 0;
    const beat = BEATS[index];
    this.beats = beat ? [{ ...beat, hold: 0, wait: 0, done: false }] : [];
    this.blocker = null;
    this.audio.applyBiome(this.level.theme);
    this.showCard(this.level);
  }

  showCard(level) {
    this.card = { numeral: level.numeral, title: level.name, t: 0, dur: 5.4 };
  }

  async startGame() {
    this.found.clear();
    this.powers.clear();
    this.memory = 0;
    this.mode = 'play';
    this.ending = null;
    this.finale = null;
    this.bossBattle = null;
    this.note = null;
    this.paused = false;
    this.fade = 1;
    this.fadeTarget = 0;
    this.frozen = false;
    this.hintT = 0;
    this.loadLevel(0);
    try {
      await this.audio.start();
      this.audio.applyBiome(this.level.theme);
    } catch (e) {
      /* audio is optional */
    }
  }

  // ---------------------------------------------------------------- loop
  start() {
    this.last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.update(dt);
      this.render();
      this.input.endFrame();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  update(dt) {
    this.time += dt;
    if (this.memorySurge) {
      this.memorySurge.t += dt;
      if (this.memorySurge.t > 1.6) this.memorySurge = null;
    }
    this.audio.update();
    this.fade = this.approach(this.fade, this.fadeTarget, dt * 1.7);
    if (this.mutedNotice > 0) this.mutedNotice -= dt;
    if (this.card) {
      this.card.t += dt;
      if (this.card.t > this.card.dur) this.card = null;
    }
    this.updateTimeline(dt);

    if (this.input.consume('mute')) {
      const m = this.audio.toggleMute();
      this.mutedNotice = 2.2;
      if (!m) this.audio.play('whisper');
    }

    if (this.mode === 'title') {
      this.titleT += dt;
      this.emitAmbient(dt);
      this.updateParticles(dt);
      this.updateGuardians(dt, true);
      if (this.input.consumeAny() || this.input.pressed('interact')) this.startGame();
      return;
    }

    if (this.mode === 'ending') {
      this.emitAmbient(dt);
      this.updateParticles(dt);
      this.ending.t += dt;
      if (this.ending.t > 3 && (this.input.pressed('restart') || this.input.pressed('interact'))) {
        this.startGame();
      }
      return;
    }

    if (this.input.consume('pause')) {
      this.paused = !this.paused;
      this.audio.play('whisper');
    }
    if (this.paused) {
      if (this.input.pressed('restart')) this.startGame();
      return;
    }

    if (this.note) {
      this.note.t += dt;
      this.note.typed += dt * 46;
      if (this.input.consume('interact')) {
        if (this.note.typed < this.note.text.length) {
          this.note.typed = this.note.text.length;
        } else {
          this.note = null;
          this.audio.play('whisper');
        }
      }
      this.updateParticles(dt);
      this.updateGuardians(dt);
      this.updateCamera(dt);
      return;
    }

    this.updatePlayer(dt);
    if (this.finale) {
      this.updateFinale(dt);
      this.emitAmbient(dt);
      this.updateParticles(dt);
      return;
    }
    if (this.bossBattle) {
      this.updateBossBattle(dt);
      this.updateCamera(dt);
      this.emitAmbient(dt);
      this.updateParticles(dt);
      return;
    }
    this.updateGuardians(dt);
    this.updateCamera(dt);
    this.updateInteraction();
    this.emitAmbient(dt);
    this.updateParticles(dt);
    this.hintT += dt;

    if (this.frozen) return;

    if (this.level.arenaX !== null && this.player.x >= this.level.arenaX) {
      this.beginFinale();
      return;
    }
    if (this.player.x >= this.level.exitX) {
      if (this.levelIndex < LEVEL_COUNT - 1) this.beginTransition();
      else this.beginFinale();
    }
  }

  approach(v, target, step) {
    if (v < target) return Math.min(target, v + step);
    if (v > target) return Math.max(target, v - step);
    return v;
  }

  // ---------------------------------------------------------------- physics
  updatePlayer(dt) {
    const p = this.player;
    const level = this.level;
    let move = 0;
    const canControl = !this.frozen && !this.finale;

    this.dashCd = Math.max(0, this.dashCd - dt);

    if (canControl) {
      move = (this.input.down('right') ? 1 : 0) - (this.input.down('left') ? 1 : 0);
      if (move !== 0) p.facing = move > 0 ? 1 : -1;
      if (this.input.pressed('up')) {
        if (p.onGround) {
          p.vy = -JUMP;
          p.onGround = false;
          p.airJump = true;
          this.audio.play('jump');
          this.puff(p.x, p.y, 3, 0.6);
        } else if (this.powers.has('leap') && p.airJump) {
          // VERDANT LEAP — a second step taken on nothing at all
          p.vy = -JUMP * 0.94;
          p.airJump = false;
          this.audio.play('jump');
          for (let i = 0; i < 12; i++) {
            const a = Math.random() * TAU;
            this.spawn({
              type: 'spark',
              x: p.x,
              y: p.y - 6,
              vx: Math.cos(a) * 30,
              vy: Math.sin(a) * 18 + 10,
              size: 1,
              color: i % 3 ? '#7fe0a4' : '#e8fff2',
              max: 0.6 + Math.random() * 0.5,
              grav: 20,
              drag: 0.95,
            });
          }
        }
      }
      if (this.powers.has('dash') && this.dashCd <= 0 && this.input.consume('dash')) {
        // EMBER DASH — a short burst forward, on the ground or in the air
        this.dashT = DASH_TIME;
        this.dashCd = DASH_COOLDOWN;
        p.vx = p.facing * DASH_SPEED;
        this.audio.play('whisper');
        for (let i = 0; i < 10; i++) {
          this.spawn({
            type: 'ember',
            x: p.x - p.facing * 4,
            y: p.y - 4 - Math.random() * 10,
            vx: -p.facing * (20 + Math.random() * 40),
            vy: (Math.random() - 0.5) * 12,
            size: 1,
            color: i % 2 ? '#ffb066' : '#ff7a3c',
            max: 0.4 + Math.random() * 0.5,
            drag: 0.93,
          });
        }
      }
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      p.vx = p.facing * DASH_SPEED;
    } else {
      p.vx = damp(p.vx, move * SPEED, 13, dt);
    }

    const nx = p.x + p.vx * dt;
    if (!this.blockedAt(nx, p.y)) p.x = nx;
    else p.vx = 0;
    p.x = clamp(p.x, 8, level.width - 8);

    // a guardian standing its ground is a soft wall until the moment passes
    const blk = this.blocker;
    if (blk && blk.x > p.x + 2) {
      const lim = blk.x - 9;
      if (p.x > lim) {
        p.x = lim;
        p.vx = 0;
      }
    }

    p.vy = this.powers.has('glide') && !p.onGround && p.vy > 0 && this.input.down('up') && canControl
      ? Math.min(p.vy + GRAV * 0.2 * dt, 62)
      : Math.min(p.vy + GRAV * dt, MAXFALL);
    if (this.powers.has('glide') && !p.onGround && p.vy > 0 && p.vy < 64 && canControl && Math.random() < dt * 22) {
      this.spawn({
        type: 'mote',
        x: p.x + (Math.random() - 0.5) * 10,
        y: p.y - 8,
        vx: (Math.random() - 0.5) * 8,
        vy: 12 + Math.random() * 10,
        size: 1,
        color: '#dff2ff',
        max: 0.7,
        alpha: 0.5,
        sway: 2,
      });
    }
    p.y += p.vy * dt;

    // land on solids
    for (const s of level.solids) {
      if (p.x + PW / 2 > s.x && p.x - PW / 2 < s.x + s.w) {
        if (p.vy >= 0 && p.y >= s.y && p.y <= s.y + 12) {
          p.y = s.y;
          p.vy = 0;
          p.onGround = true;
          p.airJump = true;
        }
      }
    }

    const gy = groundAt(level, p.x);
    if (p.y >= gy) {
      p.y = gy;
      p.vy = 0;
      p.onGround = true;
      p.airJump = true;
    } else if (p.onGround && p.vy >= 0 && gy - p.y < 6) {
      p.y = gy;
      p.vy = 0;
    } else {
      p.onGround = false;
    }

    // animation + footsteps
    const moving = Math.abs(p.vx) > 8;
    if (moving) p.anim += dt * (5.4 + Math.abs(p.vx) * 0.022);
    if (moving && p.onGround) {
      p.stepT += dt * (4.2 + Math.abs(p.vx) * 0.03);
      if (p.stepT >= 1) {
        p.stepT = 0;
        this.audio.play('step');
        this.puff(p.x - p.facing * 3, p.y, 2, 0.4);
      }
    }
    if (p.y > H + 20) {
      p.y = groundAt(level, level.spawnX);
      p.x = level.spawnX;
    }
  }

  blockedAt(x, y) {
    const gy = groundAt(this.level, x);
    if (gy < y - 8) return true;
    for (const s of this.level.solids) {
      if (x + PW / 2 > s.x && x - PW / 2 < s.x + s.w && y > s.y + 2 && y - PH < s.y + s.h) return true;
    }
    return false;
  }

  updateGuardians(dt, idle = false) {
    const p = this.player;
    if (!idle) this.updateBeats(dt);

    // what the shadows notice: a memory close by, or something in her way
    const cur = idle ? null : this.curiosity();
    const danger = idle ? null : this.hazardAhead();
    const surge = this.memorySurge ? clamp(1 - this.memorySurge.t / 1.6, 0, 1) : 0;
    for (const gd of this.guardians) {
      if (danger) gd.hesitate = 0.8;
      else gd.hesitate = Math.max(0, gd.hesitate - dt * 1.1);
    }

    for (let i = 0; i < this.guardians.length; i++) {
      const gd = this.guardians[i];
      const blocking = gd === this.blocker;
      let target;
      if (idle) {
        target = gd.x;
      } else if (blocking) {
        target = gd.blockX;
      } else {
        const off = gd.off * (1 - 0.4 * surge);
        target = p.x - p.facing * off - p.facing * (gd.hesitate > 0 ? 22 : 0);
      }
      const dist = target - gd.x;
      const ad = Math.abs(dist);
      const speed = blocking ? 250 : ad > 150 ? 170 : ad > 60 ? 104 : 54;
      if (ad < 6) gd.x = damp(gd.x, target, 3.4, dt);
      else gd.x += Math.sign(dist) * speed * dt;
      gd.x = clamp(gd.x, 4, this.level.width - 4);
      const gy = groundAt(this.level, gd.x);
      const hoverTarget = blocking ? 7 : gd.hover + (gd.hesitate > 0 ? 10 : 0) - surge * 6;
      gd.hoverCur = damp(gd.hoverCur, hoverTarget, 4, dt);
      const targetY = gy - gd.hoverCur + Math.sin(this.time * 0.9 + gd.phase) * 2.2;
      gd.y = damp(gd.y, targetY, 3.2, dt);

      // lean: down at a memory, forward at a hazard, low over the girl when it bars her way
      let want = 0;
      if (blocking) {
        want = 10 * Math.sign(p.x - gd.x || 1);
      } else if (gd.hesitate > 0 && danger) {
        want = 5 * Math.sign(danger.x - gd.x || 1);
      } else if (cur) {
        const near = clamp(1 - Math.abs(cur.x - p.x) / 96, 0, 1);
        want = near * 7 * Math.sign(cur.x - gd.x || 1);
      }
      gd.lean = damp(gd.lean, want, 5, dt);

      // shadow wisps trailing off the guardians
      gd.ember -= dt;
      if (gd.ember <= 0) {
        gd.ember = 0.16 + Math.random() * 0.2;
        this.spawn({
          type: 'smoke',
          x: gd.x + (Math.random() - 0.5) * 12,
          y: gd.y - 18 - Math.random() * 18,
          vx: (Math.random() - 0.5) * 6,
          vy: -6 - Math.random() * 8,
          size: 1 + Math.floor(Math.random() * 2),
          color: '#0a0710',
          max: 1.6 + Math.random() * 1.4,
          alpha: 0.5,
          drag: 0.985,
        });
      }
    }
  }

  curiosity() {
    if (!this.level || this.finale) return null;
    const p = this.player;
    let best = null;
    let bd = 96;
    for (const m of this.level.memories) {
      if (this.found.has(m.id)) continue;
      const d = Math.abs(m.x - p.x);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  hazardAhead() {
    if (!this.level || this.finale) return null;
    const p = this.player;
    for (const s of this.level.solids) {
      const d = s.x - p.x;
      if (d > 2 && d < 46 && s.h >= 8 && p.y - s.y < 28) return { x: s.x, d };
    }
    const gy = groundAt(this.level, p.x + 24);
    if (groundAt(this.level, p.x + 70) - gy > 20) return { x: p.x + 48, d: 48 };
    return null;
  }

  updateBeats(dt) {
    if (!this.beats.length) return;
    const p = this.player;
    for (const b of this.beats) {
      if (b.done) continue;
      if (b.hold > 0) {
        b.wait += dt;
        const gd = this.blocker;
        // the hold only begins once the shadow is actually standing in her way
        if (!gd || Math.abs(gd.x - gd.blockX) < 14) b.hold -= dt;
        if (b.hold <= 0 || b.wait > 3.6) {
          b.hold = 0;
          b.done = true;
          this.blocker = null;
          this.audio.play('whisper');
        }
        return;
      }
      if (!this.frozen && !this.note && p.onGround && Math.abs(p.x - b.x) < 80) {
        b.hold = 2;
        b.wait = 0;
        const gd = this.guardians[0];
        gd.blockX = p.x + p.facing * 92;
        this.blocker = gd;
        this.audio.play('whisper');
        return;
      }
    }
  }

  updateCamera(dt) {
    const p = this.player;
    const look = p.facing * 34;
    const target = this.bossBattle
      ? p.x - W * 0.24 + 28
      : p.x - W * 0.44 + look;
    const maxX = Math.max(0, this.level.width - W);
    this.cam.x = clamp(damp(this.cam.x, target, this.bossBattle ? 3.2 : 2.4, dt), 0, maxX);
  }

  // ---------------------------------------------------------------- memories
  updateInteraction() {
    if (this.frozen) return;
    const p = this.player;
    let best = null;
    let bestD = 30;
    for (const m of this.level.memories) {
      if (this.found.has(m.id)) continue;
      const d = Math.hypot(m.x - p.x, m.y - (p.y - 9));
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    this.nearby = best;

    // a stone with a power in it, waiting to be paid for
    const pw = this.level.power;
    this.nearPower = pw && !this.powers.has(pw.id) && Math.abs(pw.x - p.x) < 32 ? pw : null;

    if (best) {
      if (this.input.consume('interact')) this.collect(best);
      return;
    }
    if (this.nearPower && this.input.consume('interact')) this.awaken();
  }

  awaken() {
    const pw = this.level.power;
    if (!pw) return;
    if (this.memory <= 0) {
      this.note = {
        title: pw.name,
        text: 'The stone is cold and waits. It wants a memory, and she has none left to give.',
        color: '#8a8296',
        t: 0,
        typed: 0,
      };
      this.audio.play('whisper');
      return;
    }
    this.memory -= 1;
    this.powers.add(pw.id);
    this.nearPower = null;
    this.note = { title: pw.name, text: pw.text, color: pw.color, t: 0, typed: 0 };
    this.audio.play('power');
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * TAU;
      const sp = 16 + Math.random() * 52;
      this.spawn({
        type: 'spark',
        x: pw.x,
        y: pw.y - 24,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 16,
        size: 1,
        color: i % 3 ? pw.color : '#ffffff',
        max: 0.9 + Math.random() * 1.1,
        grav: 16,
        drag: 0.97,
      });
    }
  }

  collect(m) {
    this.found.add(m.id);
    this.memory += 1;
    // a memory is not a pickup: for a moment the whole world leans in
    this.memorySurge = { t: 0, color: m.color };
    for (const gd of this.guardians) gd.lean = 0;
    this.audio.play('memory');
    this.note = { title: m.title, text: m.text, color: m.color, t: 0, typed: 0 };
    this.nearby = null;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 12 + Math.random() * 40;
      this.spawn({
        type: 'spark',
        x: m.x,
        y: m.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 12,
        size: 1,
        color: i % 3 ? m.color : '#ffffff',
        max: 0.8 + Math.random() * 1.2,
        grav: 14,
        drag: 0.97,
      });
    }
  }

  // ---------------------------------------------------------------- sequences
  runTimeline(events) {
    this.timeline = { events: events.slice().sort((a, b) => a.at - b.at), t: 0, i: 0 };
  }

  updateTimeline(dt) {
    if (!this.timeline) return;
    const tl = this.timeline;
    tl.t += dt;
    while (tl.i < tl.events.length && tl.events[tl.i].at <= tl.t) {
      const e = tl.events[tl.i];
      tl.i++;
      e.fn();
    }
    if (tl.i >= tl.events.length) this.timeline = null;
  }

  beginTransition() {
    this.frozen = true;
    this.audio.play('transition');
    this.fadeTarget = 1;
    this.runTimeline([
      {
        at: 1.05,
        fn: () => {
          this.loadLevel(this.levelIndex + 1);
          this.fade = 1;
          this.fadeTarget = 0;
        },
      },
      { at: 1.35, fn: () => { this.frozen = false; } },
    ]);
  }

  // The last street. She sits, the knights raise their shields, the four answer.
  beginFinale() {
    this.frozen = true;
    this.blocker = null;
    this.nearby = null;
    this.nearPower = null;
    this.card = null;
    this.audio.play('transition');
    this.finale = {
      t: 0,
      sitX: this.level.arenaX + 34,
      sitting: false,
      shield: 0,
      flash: 0,
      balls: [],
      fired: 0,
      shown: 0,
      ended: false,
      lines: [
        'FOUR OF THEM. THEY DO NOT COME ANY CLOSER.',
        'THE SHADOWS STEP IN FRONT OF HER, ALL AT ONCE.',
        'NOTHING GETS THROUGH THE GHOST-LIGHT SHIELDS.',
      ],
    };
  }

  updateFinale(dt) {
    const f = this.finale;
    const p = this.player;
    const L = this.level;
    f.t += dt;

    // she walks to her place in the road, then sits down and stays there
    if (f.t < 1.9) {
      p.x = Math.min(f.sitX, p.x + 58 * dt);
      p.y = groundAt(L, p.x);
      p.facing = 1;
      p.anim += dt * 5.4;
    } else {
      f.sitting = true;
      p.facing = 1;
    }

    // the knights glide between her and the street
    for (let i = 0; i < 2; i++) {
      const gd = this.guardians[i];
      gd.x = damp(gd.x, f.sitX + (i === 0 ? 34 : 62), 2.4, dt);
      gd.y = damp(gd.y, groundAt(L, gd.x) - 21, 3, dt);
      gd.lean = damp(gd.lean, i === 0 ? 9 : 7, 3, dt);
    }

    f.shield = clamp((f.t - 2.6) / 1.5, 0, 1);
    f.flash = Math.max(0, f.flash - dt * 2.4);

    const camTarget = clamp(f.sitX + 150 - W * 0.5, 0, Math.max(0, L.width - W));
    this.cam.x = damp(this.cam.x, camTarget, 1.8, dt);

    const at = [1.2, 3.2, 5.0];
    if (f.shown < at.length && f.t > at[f.shown]) {
      f.shown++;
      this.audio.play('whisper');
    }

    // the four answer, one after another
    const shotAt = [5.4, 6.3, 7.2, 8.1];
    while (f.fired < shotAt.length && f.t >= shotAt[f.fired]) {
      const teen = L.teens[f.fired];
      f.balls.push({
        x: teen.x,
        y: groundAt(L, teen.x) - 34,
        x0: teen.x,
        y0: groundAt(L, teen.x) - 34,
        t: 0,
        dur: 0.95,
        color: teen.color,
      });
      this.audio.play('blast');
      f.fired++;
    }

    // the shots break on the nearest shield, not behind it
    const shieldX = f.sitX + 44;
    const impactY = groundAt(L, f.sitX) - 40;
    for (const b of f.balls) {
      b.t += dt;
      const k = clamp(b.t / b.dur, 0, 1);
      b.x = lerp(b.x0, shieldX, k);
      b.y = lerp(b.y0, impactY, k) - Math.sin(k * Math.PI) * 24;
      if (k >= 1 && !b.hit) {
        b.hit = true;
        f.flash = 1;
        for (let i = 0; i < 18; i++) {
          const a = Math.PI * (0.5 + Math.random());
          const sp = 20 + Math.random() * 55;
          this.spawn({
            type: 'spark',
            x: shieldX,
            y: impactY,
            vx: Math.cos(a) * sp - 26,
            vy: Math.sin(a) * sp - 16,
            size: 1,
            color: i % 3 ? b.color : '#ffffff',
            max: 0.5 + Math.random() * 0.7,
            grav: 90,
            drag: 0.96,
          });
        }
        this.audio.play('whisper');
      }
    }
    f.balls = f.balls.filter((b) => b.t < b.dur + 0.12);

    if (!f.ended && f.t > 11) {
      f.ended = true;
      this.beginBossBattle(f.sitX);
    }
  }

  beginBossBattle(playerX) {
    this.finale = null;
    this.frozen = false;
    this.blocker = null;
    const p = this.player;
    p.x = playerX;
    p.y = groundAt(this.level, p.x);
    p.vx = 0;
    p.vy = 0;
    p.facing = 1;
    p.onGround = true;
    p.anim = 0;

    // The guardians retreat behind her and form a protective line.
    // They move there over the first second instead of teleporting.
    const guardianTargets = [playerX - 34, playerX - 62];
    this.guardians.forEach((gd, i) => {
      gd.lean = 0;
      gd.hesitate = 0;
      gd.hover = i === 0 ? 22 : 28;
    });

    const hp = [14, 0, 0, 48];
    this.bossBattle = {
      t: 0,
      playerX,
      guardianTargets,
      guardianXs: this.guardians.map((gd) => gd.x),
      bosses: (this.level.teens || []).map((teen, i) => ({
        ...teen,
        id: i,
        kind: ['blue', 'red', 'yellow', 'brown'][i],
        hp: hp[i],
        maxHp: hp[i],
        flash: 0,
        alive: i === 0 || i === 3,
        fleeing: i === 1 || i === 2,
        escaped: false,
        fleeSpeed: i === 1 ? 164 : 190,
        lungeT: 0,
        attackCooldown: 1.0 + i * 0.35,
        stompClock: i === 3 ? 1.4 : 0,
        stompT: 0,
      })),
      shards: [],
      shardCooldown: 0,
      laserActive: false,
      laserDamageT: 0,
      defeated: 0,
      totalDefeats: 2,
      // The knights take the heavy one together while the girl duels Blue.
      brownEngaged: true,
      escapeBannerT: 4.2,
      ending: false,
    };
    // Frame the girl, the approaching blue duelist, and the distant heavy.
    this.cam.x = clamp(playerX - W * 0.24 + 28, 0, Math.max(0, this.level.width - W));
    this.audio.play('power');
  }

  updateBossBattle(dt) {
    const battle = this.bossBattle;
    if (!battle || battle.ending) return;
    battle.t += dt;
    battle.escapeBannerT = Math.max(0, battle.escapeBannerT - dt);

    const p = this.player;
    // Keep the encounter in a compact arena, but let her dodge in both directions.
    p.x = clamp(p.x, battle.playerX - 42, battle.playerX + 54);
    p.facing = 1;
    p.y = groundAt(this.level, p.x);
    p.onGround = true;

    // Red and yellow choose to run rather than fight. They are no longer targets.
    for (const boss of battle.bosses) {
      if (!boss.fleeing || boss.escaped) continue;
      boss.x += boss.fleeSpeed * dt;
      boss.y = groundAt(this.level, boss.x);
      if (boss.x > this.cam.x + W + 28) boss.escaped = true;
    }

    // The two knights fall back to positions behind the girl, then hold the line.
    for (let i = 0; i < this.guardians.length; i++) {
      const gd = this.guardians[i];
      const targetX = p.x - (i === 0 ? 34 : 62);
      gd.x = damp(gd.x, targetX, 3.0, dt);
      gd.y = damp(gd.y, groundAt(this.level, gd.x) - (i === 0 ? 22 : 28), 4.5, dt);
      gd.lean = damp(gd.lean, battle.laserActive ? 9 : (battle.brownEngaged ? 5 : 0), 4, dt);
      battle.guardianTargets[i] = targetX;
    }
    battle.guardianXs = this.guardians.map((gd) => gd.x);
    battle.guardiansReady = this.guardians.every((gd, i) => Math.abs(gd.x - battle.guardianTargets[i]) < 9);

    const blue = battle.bosses.find((boss) => boss.kind === 'blue');
    const brown = battle.bosses.find((boss) => boss.kind === 'brown');

    // Blue closes in and lunges at the girl: this is her one-on-one duel.
    if (blue && blue.alive) {
      blue.attackCooldown -= dt;
      if (blue.attackCooldown <= 0 && blue.lungeT <= 0) {
        blue.lungeT = 0.3;
        blue.attackCooldown = 1.65;
      }
      if (blue.lungeT > 0) blue.lungeT = Math.max(0, blue.lungeT - dt);
      const blueOffset = blue.lungeT > 0 ? 13 : 34;
      const blueTarget = clamp(p.x + blueOffset, p.x + 12, p.x + 48);
      blue.x = damp(blue.x, blueTarget, blue.lungeT > 0 ? 9 : 3.8, dt);
      blue.y = groundAt(this.level, blue.x);
    }

    // Brown is a true juggernaut. He only advances after Blue falls, slowly
    // enough for the girl and both guardians to turn their attention together.
    if (brown && brown.alive && battle.brownEngaged) {
      const targetX = p.x + 118;
      const step = 25 * dt;
      brown.x += clamp(targetX - brown.x, -step, step);
      brown.y = groundAt(this.level, brown.x);
      brown.stompClock -= dt;
      brown.stompT = Math.max(0, (brown.stompT || 0) - dt);
      if (brown.stompClock <= 0) {
        brown.stompClock = 3.1;
        brown.stompT = 0.65;
        this.audio.play('blast');
        for (let i = 0; i < 16; i++) {
          const side = i % 2 ? 1 : -1;
          this.spawn({
            type: 'spark',
            x: brown.x + side * (8 + Math.random() * 12),
            y: groundAt(this.level, brown.x) - 2,
            vx: side * (24 + Math.random() * 52),
            vy: -8 - Math.random() * 22,
            size: i % 3 ? 1 : 2,
            color: i % 2 ? '#c89a68' : '#ffffff',
            max: 0.35 + Math.random() * 0.3,
            grav: 46,
            drag: 0.94,
          });
        }
      }
    }

    battle.shardCooldown = Math.max(0, battle.shardCooldown - dt);
    if (this.input.consume('shard') && battle.shardCooldown <= 0) {
      this.throwWhiteShards();
      battle.shardCooldown = 0.24;
    }

    const laserNow = this.input.down('laser');
    if (laserNow && !battle.laserActive) {
      battle.laserDamageT = 0;
      this.audio.play('power');
    }
    battle.laserActive = laserNow;
    if (laserNow) {
      battle.laserDamageT += dt;
      // The guardians' combined beam is reserved for the heavy brown boss.
      while (battle.laserDamageT >= 0.22) {
        battle.laserDamageT -= 0.22;
        this.damageWithGuardianLaser();
      }
    } else {
      battle.laserDamageT = 0;
    }

    // Shards steer toward their chosen opponent, even while Blue is moving.
    const survivors = [];
    for (const shard of battle.shards) {
      shard.life += dt;
      const target = battle.bosses[shard.targetId];
      if (!target || !target.alive || shard.life > 2.0) continue;
      const tx = target.x - 2;
      const ty = groundAt(this.level, target.x) - 23;
      const dx = tx - shard.x;
      const dy = ty - shard.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const speed = 270;
      shard.vx = lerp(shard.vx, (dx / len) * speed, Math.min(1, dt * 4.5));
      shard.vy = lerp(shard.vy, (dy / len) * speed, Math.min(1, dt * 4.5));
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (Math.hypot(dx, dy) < 12) {
        this.damageBoss(target, 1, shard.x, shard.y);
        continue;
      }
      survivors.push(shard);
    }
    battle.shards = survivors;
    for (const boss of battle.bosses) boss.flash = Math.max(0, boss.flash - dt * 3.8);

    if (battle.defeated >= battle.totalDefeats) this.showBossVictory();
  }

  throwWhiteShards() {
    const battle = this.bossBattle;
    const p = this.player;
    if (!battle) return;
    // Girl duels Blue first. Once he falls, her shards join the knights against Brown.
    const target = battle.bosses.find((boss) => boss.kind === 'blue' && boss.alive)
      || battle.bosses.find((boss) => boss.kind === 'brown' && boss.alive);
    if (!target) return;

    // Three shards fly as one focused volley at the current opponent.
    for (let i = 0; i < 3; i++) {
      const sx = p.x + 8;
      const sy = p.y - 20 + (i - 1) * 3;
      const tx = target.x - 2;
      const ty = groundAt(this.level, target.x) - 23;
      const dx = tx - sx;
      const dy = ty - sy;
      const len = Math.max(1, Math.hypot(dx, dy));
      const fan = (i - 1) * 0.055;
      const a = Math.atan2(dy, dx) + fan;
      const speed = 270;
      battle.shards.push({
        x: sx,
        y: sy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        targetId: target.id,
        life: 0,
        spin: (i - 1) * 0.55,
      });
    }
    this.audio.play('blast');
    for (let i = 0; i < 7; i++) {
      this.spawn({
        type: 'spark', x: p.x + 8, y: p.y - 20,
        vx: 18 + Math.random() * 28, vy: (Math.random() - 0.5) * 34,
        size: 1, color: i % 2 ? '#ffffff' : '#cfeaff',
        max: 0.28 + Math.random() * 0.22, drag: 0.92,
      });
    }
  }

  damageWithGuardianLaser() {
    const battle = this.bossBattle;
    if (!battle || !battle.brownEngaged || !battle.guardiansReady) return;
    const brown = battle.bosses.find((boss) => boss.kind === 'brown' && boss.alive);
    if (!brown) return;
    const beamY = groundAt(this.level, this.player.x) - 40;
    const bossY = groundAt(this.level, brown.x) - 22;
    if (Math.abs(bossY - beamY) <= 36) {
      this.damageBoss(brown, 1, brown.x - 8, bossY);
    }
  }

  damageBoss(boss, amount, hitX, hitY) {
    const battle = this.bossBattle;
    if (!boss.alive || boss.fleeing) return;
    boss.hp = Math.max(0, boss.hp - amount);
    boss.flash = 1;
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * TAU;
      const speed = 18 + Math.random() * 58;
      this.spawn({
        type: 'spark', x: hitX, y: hitY,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        size: 1 + (i % 4 === 0 ? 1 : 0),
        color: i % 3 ? '#ffffff' : boss.color,
        max: 0.35 + Math.random() * 0.45, grav: 24, drag: 0.94,
      });
    }
    if (boss.hp <= 0) {
      boss.alive = false;
      battle.defeated++;
      this.audio.play('whisper');
      for (let i = 0; i < 28; i++) {
        const a = Math.random() * TAU;
        const speed = 22 + Math.random() * 76;
        this.spawn({
          type: 'spark',
          x: boss.x,
          y: groundAt(this.level, boss.x) - 22,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 12,
          size: 1 + (i % 5 === 0 ? 1 : 0),
          color: i % 2 ? boss.color : '#ffffff',
          max: 0.7 + Math.random() * 0.6,
          grav: 22,
          drag: 0.95,
        });
      }
      if (boss.kind === 'blue') {
        // The heavy one now advances; the girl and both guardians face him together.
        const brown = battle.bosses.find((entry) => entry.kind === 'brown');
        if (brown) brown.stompClock = 0.85;
        this.player.facing = 1;
      }
    }
  }

  showBossVictory() {
    const battle = this.bossBattle;
    if (!battle || battle.ending) return;
    battle.ending = true;
    this.mode = 'ending';
    this.ending = {
      name: 'THE LAST LIGHT',
      continued: true,
      lines: [
        'RED AND YELLOW RAN INTO THE DARK.',
        'BLUE CHALLENGED THE GIRL AT THE FRONT.',
        'THE TWO GUARDIANS HELD THE LINE BEHIND HER.',
        'THE THREE OF THEM BROKE THE HEAVY ONE.',
      ],
      count: this.found.size,
      powers: this.powers.size,
      t: 0,
    };
    this.bossBattle = null;
    this.fade = 1;
    this.fadeTarget = 0;
    this.audio.play('ending');
    this.audio.applyBiome('city');
  }

  // ---------------------------------------------------------------- particles
  spawn(p) {
    if (this.particles.length > 520) return;
    this.particles.push({
      x: 0, y: 0, vx: 0, vy: 0, grav: 0, drag: 1, size: 1,
      color: '#ffffff', life: 0, max: 1, alpha: 1, type: 'mote',
      wob: 2, sway: 0, phase: Math.random() * 10, ...p,
    });
  }

  puff(x, y, n, scale = 1) {
    const theme = this.level ? this.level.theme : 'forest';
    const colors = {
      forest: ['#2a4438', '#1b2e26', '#3f5b4a'],
      desert: ['#e8dcc0', '#d3c3a1', '#f2ead4'],
      mountain: ['#dceaf8', '#b6cbe0', '#ffffff'],
      village: ['#5a4a44', '#6d5b52', '#8a786c'],
      city: ['#3a3f52', '#4a5166', '#5c6478'],
    }[theme] || ['#ffffff'];
    for (let i = 0; i < n; i++) {
      this.spawn({
        type: 'mote',
        x: x + (Math.random() - 0.5) * 5,
        y: y - Math.random() * 2,
        vx: (Math.random() - 0.5) * 16 * scale,
        vy: -Math.random() * 10 * scale,
        size: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        max: 0.5 + Math.random() * 0.6,
        grav: 12,
        alpha: 0.55,
        drag: 0.94,
      });
    }
  }

  emitAmbient(dt) {
    if (!this.level) return;
    const theme = this.level.theme;
    const camX = this.cam.x;
    const rnd = Math.random;

    if (theme === 'forest') {
      if (rnd() < dt * 5) {
        this.spawn({
          type: 'firefly',
          x: camX + rnd() * W,
          y: 120 + rnd() * 110,
          vx: (rnd() - 0.5) * 8,
          vy: (rnd() - 0.5) * 6,
          color: rnd() < 0.65 ? '#a8f5e4' : '#d8b6ff',
          max: 5 + rnd() * 6,
          size: 1,
          alpha: 0.85,
          sway: 4,
        });
      }
      if (rnd() < dt * 3) {
        this.spawn({
          type: 'mote',
          x: camX + rnd() * W,
          y: 60 + rnd() * 140,
          vx: -3 - rnd() * 5,
          vy: 4 + rnd() * 6,
          color: '#7fa89a',
          max: 8,
          alpha: 0.3,
          size: 1,
        });
      }
    } else if (theme === 'desert') {
      const gust = 0.55 + Math.sin(this.time * 0.35) * 0.45;
      if (rnd() < dt * 9 * gust) {
        this.spawn({
          type: 'mote',
          x: camX + (gust > 0.5 ? -10 : W + 10),
          y: 90 + rnd() * 150,
          vx: (12 + rnd() * 26) * gust,
          vy: (rnd() - 0.5) * 4,
          color: '#f4e6c8',
          max: 4 + rnd() * 4,
          alpha: 0.35,
          size: rnd() < 0.2 ? 2 : 1,
        });
      }
      if (rnd() < dt * 1.6) {
        this.spawn({
          type: 'sand',
          x: camX + rnd() * W,
          y: 205 + rnd() * 60,
          vx: 26 + rnd() * 30,
          vy: -1,
          color: '#e6d6b4',
          max: 2.4,
          alpha: 0.28,
          size: 1,
        });
      }
    } else if (theme === 'mountain') {
      const wind = 10 + Math.sin(this.time * 0.5) * 14;
      const n = Math.round(dt * 34);
      for (let i = 0; i < n; i++) {
        this.spawn({
          type: 'snow',
          x: camX - 30 + rnd() * (W + 60),
          y: -6,
          vx: wind + (rnd() - 0.5) * 10,
          vy: 18 + rnd() * 30,
          color: rnd() < 0.25 ? '#ffffff' : '#dbe8f6',
          max: 9,
          alpha: 0.35 + rnd() * 0.45,
          size: rnd() < 0.15 ? 2 : 1,
          sway: 4 + rnd() * 10,
        });
      }
      if (rnd() < dt * 3) {
        this.spawn({
          type: 'mote',
          x: camX + rnd() * W,
          y: 100 + rnd() * 150,
          vx: -30 - rnd() * 30,
          vy: 2,
          color: '#cfe3f5',
          max: 2,
          alpha: 0.24,
          size: 1,
        });
      }
    } else if (theme === 'city') {
      // the city breathes cold air and old light
      if (rnd() < dt * 4) {
        this.spawn({
          type: 'mote',
          x: camX + rnd() * W,
          y: 60 + rnd() * 150,
          vx: -4 - rnd() * 10,
          vy: 3 + rnd() * 6,
          color: rnd() < 0.6 ? '#8fa6c8' : '#c8d6e8',
          max: 7 + rnd() * 5,
          alpha: 0.28,
          size: 1,
          sway: 3,
        });
      }
      if (rnd() < dt * 1.6) {
        this.spawn({
          type: 'ember',
          x: camX + rnd() * W,
          y: 190 + rnd() * 60,
          vx: (rnd() - 0.5) * 6,
          vy: -4 - rnd() * 10,
          color: '#ffcf8e',
          max: 2 + rnd() * 2,
          size: 1,
          sway: 2,
        });
      }
    } else {
      // village: embers and ash
      const boost = 1;
      if (rnd() < dt * 7 * boost) {
        this.spawn({
          type: 'ember',
          x: camX + rnd() * W,
          y: 200 + rnd() * 70,
          vx: (rnd() - 0.5) * 8,
          vy: -10 - rnd() * 22,
          color: rnd() < 0.5 ? '#ff9a4a' : '#ff6a20',
          max: 2.5 + rnd() * 3.5,
          size: rnd() < 0.12 ? 2 : 1,
          sway: 3,
        });
      }
      if (rnd() < dt * 4) {
        this.spawn({
          type: 'mote',
          x: camX + rnd() * W,
          y: -4,
          vx: -6 - rnd() * 10,
          vy: 6 + rnd() * 8,
          color: rnd() < 0.5 ? '#8a7a6c' : '#5a4a44',
          max: 8,
          alpha: 0.35,
          size: 1,
        });
      }
      if (rnd() < dt * 2.2) {
        this.spawn({
          type: 'smoke',
          x: camX + rnd() * W,
          y: 200 + rnd() * 40,
          vx: -3 - rnd() * 4,
          vy: -6 - rnd() * 7,
          color: '#241a1c',
          max: 3 + rnd() * 2.5,
          alpha: 0.4,
          size: 2 + Math.floor(rnd() * 3),
          drag: 0.99,
        });
      }
    }
  }

  updateParticles(dt) {
    const keep = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      if (p.type === 'firefly') {
        p.vx += (Math.random() - 0.5) * 30 * dt;
        p.vy += (Math.random() - 0.5) * 30 * dt;
        p.vx *= 0.97;
        p.vy *= 0.97;
      }
      p.vx *= Math.pow(p.drag, dt * 60);
      p.x += (p.vx + Math.sin(this.time * p.wob + p.phase) * p.sway) * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      keep.push(p);
    }
    this.particles = keep;
  }

  // ---------------------------------------------------------------- render
  render() {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    if (this.mode === 'ending') {
      this.drawEnding(g);
      this.drawOverlays(g);
      return;
    }

    this.drawSky(g);
    this.drawParallax(g);
    this.drawMist(g);
    this.drawTerrain(g);
    this.drawMemories(g);
    this.drawPowerSite(g);
    this.drawEntities(g);
    this.drawParticles(g);
    this.drawVillageFires(g);
    this.drawLighting(g);
    this.drawFogFront(g);
    this.drawPost(g);
    this.drawUI(g);
    this.drawOverlays(g);
  }

  drawSky(g) {
    const stops = SKY[this.level ? this.level.theme : 'forest'] || SKY.forest;
    vgrad(g, 0, 0, W, H, stops, 2);
  }

  drawParallax(g) {
    for (const layer of this.level.layers) {
      const off = -Math.round(this.cam.x * layer.factor);
      g.drawImage(layer.canvas, off, 0);
    }
  }

  drawMist(g) {
    const m = MIST[this.level.theme] || MIST.forest;
    const t = this.time;
    g.save();
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 3; i++) {
      const y = m.y + i * 22 + Math.sin(t * 0.16 + i) * 6;
      const a = m.alpha * (0.6 + 0.4 * Math.sin(t * 0.22 + i * 2));
      const grad = g.createLinearGradient(0, y, 0, y + m.h * 0.7);
      grad.addColorStop(0, rgba(m.color, 0));
      grad.addColorStop(0.5, rgba(m.color, a));
      grad.addColorStop(1, rgba(m.color, 0));
      g.fillStyle = grad;
      g.fillRect(0, y, W, m.h * 0.7);
    }
    g.restore();
  }

  drawTerrain(g) {
    const x = Math.round(this.cam.x);
    const sliceW = Math.min(W + 2, this.level.width - x);
    if (sliceW <= 0) return;
    g.drawImage(this.level.canvas, x, 0, sliceW, H, 0, 0, sliceW, H);
  }

  drawMemories(g) {
    for (const m of this.level.memories) {
      const sx = m.x - this.cam.x;
      if (sx < -30 || sx > W + 30) continue;
      const bob = Math.sin(this.time * 1.6 + m.x * 0.01) * 2;
      drawWisp(g, sx, m.y + bob, this.time, m.color, this.found.has(m.id));
      if (this.nearby === m && !this.found.has(m.id)) {
        const pulse = 0.6 + Math.sin(this.time * 4) * 0.4;
        drawText(g, 'E  REMEMBER', sx, m.y - 23 + bob, {
          align: 'center', color: `rgba(238,234,248,${pulse})`, scale: 1, shadow: '#000000',
        });
      }
    }
  }

  drawEntities(g) {
    if (this.mode === 'title') return; // the title uses its own composed tableau
    if (this.finale) {
      this.drawFinale(g);
      return;
    }
    if (this.bossBattle) {
      this.drawBossBattle(g);
      return;
    }
    // the four, standing at the end of the last street, before she reaches them
    if (this.level.teens) {
      for (const teen of this.level.teens) {
        const sx = teen.x - this.cam.x;
        if (sx < -70 || sx > W + 70) continue;
        drawTeen(g, sx, groundAt(this.level, teen.x), this.time, {
          color: teen.color, style: teen.style, scale: teen.scale, flare: 0.72, facing: -1,
        });
      }
    }
    // far guardian, near guardian, then the girl
    for (let i = this.guardians.length - 1; i >= 0; i--) {
      const gd = this.guardians[i];
      const sx = gd.x - this.cam.x;
      if (sx < -80 || sx > W + 80) continue;
      drawGuardian(g, sx, gd.y, this.time, gd.phase, {
        scale: i === 0 ? 1.04 : 0.92,
        alpha: i === 0 ? 0.98 : 0.9,
        eye: i === 0 ? '#dfeafa' : '#c6d6ea',
        lean: gd.lean,
        eyeGlow: 0.26 + Math.min(0.3, Math.abs(gd.lean) / 26),
      });
    }
    this.drawPlayer(g);
    if (this.level.foreground) {
      const x = Math.round(this.cam.x);
      g.drawImage(this.level.foreground, x, 0, Math.min(W, this.level.width - x), H, 0, 0, Math.min(W, this.level.width - x), H);
    }
  }

  drawPowerSite(g) {
    const pw = this.level.power;
    if (!pw || this.powers.has(pw.id)) return;
    const sx = pw.x - this.cam.x;
    if (sx < -40 || sx > W + 40) return;
    const baseY = pw.y;
    const bob = Math.sin(this.time * 1.4) * 2;
    const cy = baseY - 24 + bob;
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, sx, cy, 24, pw.color, 0.3);
    g.restore();
    disc(g, sx, cy, 2, pw.color);
    for (let i = 0; i < 8; i++) {
      const a = this.time * 0.9 + (i / 8) * TAU;
      g.fillStyle = pw.color;
      g.fillRect(Math.round(sx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 5), 1, 1);
    }
    if (this.nearPower === pw) {
      const pulse = 0.6 + Math.sin(this.time * 4) * 0.4;
      const label = this.memory > 0 ? 'E  SPEND A MEMORY' : 'ONE MEMORY NEEDED';
      drawText(g, label, sx, baseY - 46 + bob, {
        align: 'center',
        color: rgba(this.memory > 0 ? '#ffffff' : '#8a8296', pulse),
        scale: 1,
        shadow: '#000000',
      });
    }
  }

  drawFinale(g) {
    const f = this.finale;
    const L = this.level;
    // the four at the end of the street
    for (const teen of L.teens || []) {
      const sx = teen.x - this.cam.x;
      if (sx < -80 || sx > W + 80) continue;
      drawTeen(g, sx, groundAt(L, teen.x), this.time, {
        color: teen.color,
        style: teen.style,
        scale: teen.scale,
        flare: f.t > 5 ? 1.4 : 0.95,
        facing: -1,
      });
    }
    // her, sitting in the road
    const p = this.player;
    const sx = Math.round(p.x - this.cam.x);
    const sy = Math.round(p.y);
    g.save();
    g.translate(sx, sy);
    if (f.sitting) g.drawImage(GIRL_SIT, -6, -12);
    else g.drawImage(GIRL.idle[0], -6, -19);
    g.restore();
    // the knights and the ghost-light between the street and her
    for (let i = 1; i >= 0; i--) {
      const gd = this.guardians[i];
      const gsx = gd.x - this.cam.x;
      drawGuardian(g, gsx, gd.y, this.time, gd.phase, {
        scale: 1.02,
        alpha: 0.98,
        eye: '#e8f2ff',
        lean: gd.lean,
        eyeGlow: 0.34,
      });
      if (f.shield > 0) {
        drawShield(g, gsx + 10, gd.y - 24, this.time, '#9fc8ff', f.shield, f.flash);
      }
    }
    // the energy they throw at her
    for (const b of f.balls) {
      const bx = b.x - this.cam.x;
      const by = b.y;
      g.save();
      g.globalCompositeOperation = 'lighter';
      glow(g, bx, by, 22, b.color, 0.6);
      g.fillStyle = b.color;
      for (let i = 1; i <= 7; i++) {
        const k = i / 7;
        g.globalAlpha = (1 - k) * 0.55;
        g.fillRect(Math.round(bx + k * 18), Math.round(by - k * 2), 2, 2);
      }
      g.restore();
      disc(g, bx, by, 3, '#ffffff');
      disc(g, bx, by, 2, b.color);
    }
  }

  drawBossBattle(g) {
    const battle = this.bossBattle;
    const L = this.level;

    // The knights' beam reaches past the girl toward the heavy brown boss.
    if (battle.laserActive) this.drawGuardianLaser(g);

    // Red and yellow are visibly fleeing; they are not combat targets anymore.
    for (const boss of battle.bosses) {
      if (!boss.fleeing || boss.escaped) continue;
      const sx = boss.x - this.cam.x;
      if (sx < -80 || sx > W + 80) continue;
      drawTeen(g, sx, groundAt(L, boss.x), this.time, {
        color: boss.color,
        style: boss.style,
        scale: boss.scale,
        flare: 0.8,
        facing: 1,
      });
      // Short streaks make their retreat unmistakable.
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.38;
      g.fillStyle = boss.color;
      g.fillRect(Math.round(sx - 15), Math.round(groundAt(L, boss.x) - 20), 9, 1);
      g.fillRect(Math.round(sx - 11), Math.round(groundAt(L, boss.x) - 25), 6, 1);
      g.restore();
    }

    // Active opponents: Blue duels the girl; Brown waits as the slow juggernaut.
    for (const boss of battle.bosses) {
      if (!boss.alive || boss.fleeing) continue;
      const sx = boss.x - this.cam.x;
      if (sx < -80 || sx > W + 80) continue;
      const isBlue = boss.kind === 'blue';
      drawTeen(g, sx, groundAt(L, boss.x), this.time, {
        color: boss.color,
        style: boss.style,
        scale: boss.scale,
        flare: boss.flash > 0 ? 1.65 : (isBlue && boss.lungeT > 0 ? 1.35 : 0.92),
        facing: -1,
      });
      if (boss.flash > 0) {
        g.save();
        g.globalAlpha = boss.flash * 0.22;
        g.fillStyle = '#ffffff';
        g.fillRect(Math.round(sx - 10), Math.round(groundAt(L, boss.x) - 48), 20, 46);
        g.restore();
      }
      if (isBlue && boss.lungeT > 0.12) {
        const girlX = this.player.x - this.cam.x;
        const slashY = groundAt(L, boss.x) - 21;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.75;
        glow(g, (sx + girlX) * 0.5, slashY, 22, '#6fa8ff', 0.65);
        g.strokeStyle = '#b9d7ff';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx - 6, slashY + 5);
        g.lineTo(girlX + 5, slashY - 5);
        g.stroke();
        g.restore();
      }
      if (boss.kind === 'brown' && boss.stompT > 0) {
        const pulse = 1 - boss.stompT / 0.65;
        const radius = 16 + pulse * 34;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = (1 - pulse) * 0.7;
        g.strokeStyle = '#d6b28a';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(sx, groundAt(L, boss.x) - 2, radius, 4 + pulse * 3, 0, 0, TAU);
        g.stroke();
        g.restore();
      }
    }

    // The knights are behind her, one close and one farther back.
    for (let i = 1; i >= 0; i--) {
      const gd = this.guardians[i];
      const sx = gd.x - this.cam.x;
      drawGuardian(g, sx, gd.y, this.time, gd.phase, {
        scale: i === 0 ? 1.04 : 0.98,
        alpha: 0.99,
        eye: '#f4f8ff',
        lean: battle.laserActive ? 9 : (battle.brownEngaged ? 5 : 0),
        eyeGlow: battle.laserActive ? 0.84 : 0.34,
      });
    }

    this.drawPlayer(g);

    // Bright, angular shards thrown by the girl.
    for (const shard of battle.shards) {
      const sx = shard.x - this.cam.x;
      const sy = shard.y;
      if (sx < -20 || sx > W + 20) continue;
      g.save();
      g.translate(Math.round(sx), Math.round(sy));
      g.rotate(Math.atan2(shard.vy, shard.vx) + shard.spin);
      g.globalCompositeOperation = 'lighter';
      glow(g, 0, 0, 12, '#dff3ff', 0.6);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(6, 0);
      g.lineTo(0, -3);
      g.lineTo(-5, 0);
      g.lineTo(0, 3);
      g.closePath();
      g.fill();
      g.fillStyle = '#bdeaff';
      g.fillRect(-3, -1, 5, 2);
      g.restore();
    }

    if (L.foreground) {
      const x = Math.round(this.cam.x);
      g.drawImage(L.foreground, x, 0, Math.min(W, L.width - x), H, 0, 0, Math.min(W, L.width - x), H);
    }
  }

  drawGuardianLaser(g) {
    const battle = this.bossBattle;
    const L = this.level;
    const sx = Math.min(...battle.guardianXs) - this.cam.x + 8;
    const brown = battle.bosses.find((boss) => boss.kind === 'brown');
    const endWorld = brown ? brown.x + 34 : battle.playerX + 180;
    const ex = Math.min(W + 20, endWorld - this.cam.x);
    const beamY = groundAt(L, this.player.x) - 40;
    const width = Math.max(0, ex - sx);
    if (width <= 0) return;
    const pulse = 0.9 + Math.sin(this.time * 26) * 0.08;

    g.save();
    g.globalCompositeOperation = 'lighter';
    // Wide atmospheric bloom, broad white body, then a sharp central core.
    g.globalAlpha = 0.42 * pulse;
    g.fillStyle = '#c9e8ff';
    g.fillRect(sx, beamY - 26, width, 52);
    glow(g, sx + width * 0.55, beamY, Math.min(150, width * 0.62), '#d9f0ff', 0.55);
    g.globalAlpha = 0.72;
    g.fillStyle = '#eaf7ff';
    g.fillRect(sx, beamY - 16, width, 32);
    g.globalAlpha = 0.94;
    g.fillStyle = '#ffffff';
    g.fillRect(sx, beamY - 7, width, 14);
    g.globalAlpha = 0.8;
    g.fillStyle = '#ffffff';
    g.fillRect(sx, beamY - 2, width, 4);
    // Two bright mouths make it clear that both knights are powering it.
    for (const gx of battle.guardianXs) {
      const x = gx - this.cam.x + 10;
      glow(g, x, beamY, 27, '#ffffff', 0.92);
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(x - 2), Math.round(beamY - 13), 7, 26);
    }
    // A few moving pinpoints give the beam a sense of forward force.
    for (let i = 0; i < 12; i++) {
      const k = (this.time * 2.8 + i / 12) % 1;
      const x = sx + k * width;
      const y = beamY + Math.sin(this.time * 17 + i * 2.1) * 9;
      g.globalAlpha = 0.55 + (i % 3) * 0.12;
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
    g.restore();
  }

  drawPlayer(g) {
    const p = this.player;
    const sx = Math.round(p.x - this.cam.x);
    const sy = Math.round(p.y);
    const moving = Math.abs(p.vx) > 8;
    let sprite;
    let bob = 0;
    if (moving) {
      const idx = Math.floor(p.anim) % 4;
      sprite = GIRL.walk[idx];
      bob = idx === 1 || idx === 3 ? -1 : 0;
    } else {
      sprite = GIRL.idle[0];
      bob = Math.sin(this.time * 1.3) > 0.4 ? -1 : 0;
    }
    g.save();
    g.translate(sx, sy + bob);
    if (p.facing < 0) g.scale(-1, 1);
    g.drawImage(sprite, -6, -19);
    g.restore();
  }

  drawParticles(g) {
    g.save();
    for (const p of this.particles) {
      const sx = p.x - this.cam.x;
      if (sx < -20 || sx > W + 20) continue;
      const k = p.life / p.max;
      const alpha = p.alpha * (k > 0.75 ? (1 - k) / 0.25 : Math.min(1, k * 6));
      if (p.type === 'spark' || p.type === 'ember' || p.type === 'firefly') {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = alpha * (p.type === 'firefly' ? 0.6 + 0.4 * Math.sin(this.time * 3 + p.phase) : 0.9);
        g.fillStyle = p.color;
        g.fillRect(Math.round(sx), Math.round(p.y), p.size, p.size);
        if (p.type !== 'spark') {
          g.globalAlpha = alpha * 0.22;
          g.fillRect(Math.round(sx) - 1, Math.round(p.y), p.size + 2, 1);
          g.fillRect(Math.round(sx), Math.round(p.y) - 1, 1, p.size + 2);
        }
      } else if (p.type === 'smoke') {
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = alpha * 0.5;
        g.fillStyle = p.color;
        g.fillRect(Math.round(sx), Math.round(p.y), p.size, p.size);
      } else {
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = alpha;
        g.fillStyle = p.color;
        g.fillRect(Math.round(sx), Math.round(p.y), p.size, p.size);
      }
    }
    g.restore();
  }

  drawVillageFires(g) {
    if (!this.level.valleyFires || !this.level.valleyFires.length) return;
    const layer = this.level.layers[1];
    const off = -Math.round(this.cam.x * layer.factor);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const f of this.level.valleyFires) {
      const sx = f.lx + off;
      if (sx < -40 || sx > W + 40) continue;
      const fl = 0.65 + Math.sin(this.time * 2.6 + f.phase) * 0.22 + Math.sin(this.time * 7.3 + f.phase * 3) * 0.1;
      glow(g, sx, f.ly, f.r * 2.4 * fl, '#ff7a30', 0.16 * fl);
    }
    g.restore();
  }

  drawLighting(g) {
    const cam = this.cam;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const l of this.level.lights) {
      const sx = l.x - cam.x;
      if (sx < -80 || sx > W + 80) continue;
      const fl = 1 - l.flicker * 0.5 + Math.sin(this.time * (2 + l.flicker * 3) + l.x) * 0.5 * l.flicker;
      glow(g, sx, l.y, l.r * (0.85 + fl * 0.25), l.color, l.alpha * (0.75 + fl * 0.35));
    }
    // faint aura around the girl so she always reads
    const p = this.player;
    const tone = {
      forest: '#9fe4dc', desert: '#ffe8c8', mountain: '#cfe4ff', village: '#ff9a5a', city: '#9fc8ff',
    }[this.level.theme];
    glow(g, p.x - cam.x, p.y - 10, 46, tone, 0.075);
    g.restore();

    // guardians draw darkness around themselves: subtle desaturation pocket
    g.save();
    g.globalCompositeOperation = 'source-over';
    for (const gd of this.guardians) {
      const sx = gd.x - cam.x;
      if (sx < -60 || sx > W + 60) continue;
      const grad = g.createRadialGradient(sx, gd.y - 26, 2, sx, gd.y - 26, 42);
      grad.addColorStop(0, 'rgba(2,1,4,0.30)');
      grad.addColorStop(1, 'rgba(2,1,4,0)');
      g.fillStyle = grad;
      g.fillRect(sx - 44, gd.y - 72, 88, 88);
    }
    g.restore();
  }

  drawFogFront(g) {
    const m = MIST[this.level.theme] || MIST.forest;
    const grad = g.createLinearGradient(0, H - 54, 0, H);
    grad.addColorStop(0, rgba(m.color, 0));
    grad.addColorStop(1, rgba(m.color, m.alpha * 0.9));
    g.fillStyle = grad;
    g.fillRect(0, H - 54, W, 54);
  }

  drawPost(g) {
    g.drawImage(this.vignette, 0, 0);
    const grain = this.grain[Math.floor(this.time * 7) % this.grain.length];
    g.save();
    g.globalAlpha = 0.03;
    const ox = -Math.floor((this.time * 11) % 180);
    const oy = -Math.floor((this.time * 7) % 150);
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        g.drawImage(grain, ox + tx * 180, oy + ty * 150);
      }
    }
    g.restore();
    // a slow breathing darkness at the frame edges
    const pulse = 0.02 + Math.sin(this.time * 0.5) * 0.012;
    g.fillStyle = `rgba(0,0,0,${pulse})`;
    g.fillRect(0, 0, W, H);
  }

  drawUI(g) {
    if (this.mode !== 'play') return;
    // what she carries, and what she has spent
    const x = 10;
    const y = 9;
    g.save();
    g.globalAlpha = 0.78;
    drawText(g, '*', x, y, { color: '#cfc6e4', scale: 1 });
    drawText(g, `${this.found.size}/${TOTAL_MEMORIES}`, x + 8, y, { color: '#a9a2bd', scale: 1 });
    if (this.found.size > 0) {
      drawText(g, `UNSPENT ${this.memory}`, x + 42, y, {
        color: this.memory > 0 ? '#e4d9b8' : '#5d566e', scale: 1,
      });
    }
    // the powers she has bought, each in its own colour
    let px = x;
    for (const pw of POWERS) {
      if (!this.powers.has(pw.id)) continue;
      g.fillStyle = pw.color;
      g.fillRect(px, y + 13, 3, 3);
      drawText(g, pw.name, px + 6, y + 11, { color: pw.color, scale: 1 });
      px += textWidth(pw.name, 1, 1) + 17;
    }
    g.restore();

    if (this.mutedNotice > 0) {
      g.save();
      g.globalAlpha = clamp(this.mutedNotice, 0, 1) * 0.8;
      drawText(g, 'SOUND OFF', 10, 21, { color: '#8a8296', scale: 1 });
      g.restore();
    }

    if (this.bossBattle) this.drawBossBattleUI(g);

    if (this.hintT < 9 && this.levelIndex === 0) {
      const a = clamp(this.hintT < 7 ? 1 : 9 - this.hintT, 0, 1) * 0.85;
      g.save();
      g.globalAlpha = a;
      drawText(g, 'A D WALK   W JUMP   E REMEMBER / SPEND   SHIFT DASH', W / 2, H - 18, {
        align: 'center', color: '#b8b0c4', scale: 1,
      });
      g.restore();
    }

    const beat = this.beats.find((b) => b.hold > 0);
    if (beat) {
      const a = clamp((2 - beat.hold) / 0.5, 0, 1) * clamp(beat.hold / 0.7, 0, 1);
      g.save();
      g.globalAlpha = a * 0.85;
      drawText(g, beat.line, W / 2, 224, {
        align: 'center', color: '#cfc4c0', scale: 1, spacing: 1, shadow: '#0a0709',
      });
      g.restore();
    }

    if (this.card) this.drawCard(g);
  }

  drawBossBattleUI(g) {
    const battle = this.bossBattle;
    if (!battle) return;
    g.save();
    g.fillStyle = 'rgba(3,4,10,0.68)';
    g.fillRect(48, 4, W - 96, 39);
    const blueBoss = battle.bosses.find((boss) => boss.kind === 'blue');
    const heading = blueBoss && blueBoss.alive ? 'BLUE DUEL  /  BROWN HEAVY' : 'THE HEAVY ONE';
    drawText(g, heading, W / 2, 7, {
      align: 'center', color: '#e9edf6', scale: 1, spacing: 2, shadow: '#000000',
    });

    const entries = [
      { kind: 'blue', label: 'BLUE  /  DUEL', x: 88, w: 128 },
      { kind: 'brown', label: 'BROWN  /  HEAVY', x: 264, w: 128 },
    ];
    for (const entry of entries) {
      const boss = battle.bosses.find((item) => item.kind === entry.kind);
      const color = boss ? boss.color : '#ffffff';
      drawText(g, entry.label, entry.x + entry.w / 2, 19, {
        align: 'center', color: boss && boss.alive ? color : '#777582', scale: 1, spacing: 1,
      });
      g.fillStyle = 'rgba(150,150,170,0.24)';
      g.fillRect(entry.x, 31, entry.w, 4);
      if (boss && boss.alive && boss.maxHp > 0) {
        g.fillStyle = color;
        g.fillRect(entry.x, 31, Math.max(0, entry.w * boss.hp / boss.maxHp), 4);
      }
    }

    if (battle.escapeBannerT > 0) {
      const a = Math.min(1, battle.escapeBannerT * 1.5);
      drawText(g, 'RED + YELLOW FLED', W / 2, 54, {
        align: 'center', color: `rgba(225,220,235,${a})`, scale: 1, spacing: 1, shadow: '#000000',
      });
    }
    const laserText = battle.laserActive
      ? (battle.brownEngaged ? 'GUARDIANS: HEAVY BEAM' : 'GUARDIANS: CHARGING')
      : 'HOLD C  KNIGHTS\' WIDE LASER';
    drawText(g, 'X  WHITE SHARDS', W / 2, H - 25, {
      align: 'center', color: '#f2f0f7', scale: 1, spacing: 1, shadow: '#000000',
    });
    drawText(g, laserText, W / 2, H - 13, {
      align: 'center', color: battle.laserActive ? '#ffffff' : '#b8c7da', scale: 1, spacing: 1, shadow: '#000000',
    });
    g.restore();
  }

  drawCard(g) {
    const c = this.card;
    const t = c.t;
    let a = 0;
    if (t < 0.8) a = t / 0.8;
    else if (t > c.dur - 1.4) a = Math.max(0, (c.dur - t) / 1.4);
    g.save();
    g.globalAlpha = a;
    const y = 74;
    drawText(g, c.numeral, W / 2, y - 26, { align: 'center', color: '#8f86a6', scale: 1, spacing: 2 });
    drawText(g, c.title, W / 2, y, { align: 'center', color: '#e6e0f0', scale: 2, spacing: 2, shadow: '#000000' });
    g.fillStyle = 'rgba(190,180,210,0.35)';
    g.fillRect(W / 2 - 54, y + 20, 108, 1);
    drawText(g, 'THE LAST JOURNEY', W / 2, y + 28, { align: 'center', color: '#6f6884', scale: 1, spacing: 2 });
    g.restore();
  }

  drawOverlays(g) {
    // the colour of the memory she just took, breathing over the frame
    if (this.memorySurge) {
      const s = clamp(this.memorySurge.t, 0, 1.6);
      const a = (1 - s / 1.6) * 0.12;
      g.fillStyle = rgba(this.memorySurge.color, a);
      g.fillRect(0, 0, W, H);
    }
    if (this.fade > 0.001) {
      g.fillStyle = `rgba(0,0,0,${clamp(this.fade, 0, 1)})`;
      g.fillRect(0, 0, W, H);
    }
    if (this.mode === 'title') this.drawTitle(g);
    if (this.note) this.drawNote(g);
    if (this.paused) this.drawPause(g);
  }

  drawTitle(g) {
    const t = this.titleT;
    const a = clamp(t / 1.6, 0, 1);
    g.save();
    // darken the scene a little so text reads
    g.fillStyle = `rgba(2,3,8,${0.34 * a})`;
    g.fillRect(0, 0, W, H);

    // composed key art: the girl and her two guardians
    const cx = W / 2 + 2;
    const baseY = H - 44;
    g.save();
    g.globalAlpha = clamp((t - 0.3) / 1.8, 0, 1);
    g.globalCompositeOperation = 'lighter';
    glow(g, cx, baseY - 30, 74, '#93b6d6', 0.10);
    glow(g, cx - 52, baseY - 46, 40, '#6f7fa8', 0.06);
    glow(g, cx + 54, baseY - 46, 40, '#6f7fa8', 0.06);
    g.restore();

    g.save();
    g.globalAlpha = clamp((t - 0.5) / 1.8, 0, 1);
    drawGuardian(g, cx - 52, baseY, this.time, 1.3, { scale: 1.3, alpha: 0.96, eye: '#e4eefc' });
    drawGuardian(g, cx + 54, baseY, this.time, 3.6, { scale: 1.3, alpha: 0.96, eye: '#e4eefc' });
    g.restore();

    g.save();
    g.globalAlpha = clamp((t - 0.7) / 1.8, 0, 1);
    const bob = Math.sin(this.time * 1.3) > 0.4 ? -1 : 0;
    g.drawImage(GIRL.idle[0], Math.round(cx) - 12, baseY - 38 + bob, 24, 38);
    g.restore();

    g.globalAlpha = a;
    drawText(g, 'THE LAST', W / 2, 26, { align: 'center', color: '#efe9f6', scale: 3, spacing: 3, shadow: '#000000' });
    drawText(g, 'JOURNEY', W / 2, 52, { align: 'center', color: '#efe9f6', scale: 3, spacing: 6, shadow: '#000000' });
    g.fillStyle = 'rgba(210,200,230,0.28)';
    g.fillRect(W / 2 - 70, 78, 140, 1);
    drawText(g, 'SHE DOES NOT SPEAK. THE SHADOWS DO NOT EITHER.', W / 2, 86, {
      align: 'center', color: '#918aa4', scale: 1, spacing: 1,
    });

    const blink = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.7));
    if (t > 1.4) {
      g.globalAlpha = blink;
      drawText(g, 'PRESS ANY KEY', W / 2, 110, { align: 'center', color: '#e8e2f2', scale: 1, spacing: 3 });
      g.globalAlpha = a;
    }

    g.globalAlpha = a * 0.72;
    drawText(g, 'A / D  OR  ARROWS  WALK      W  JUMP      E  REMEMBER', W / 2, H - 22, {
      align: 'center', color: '#7d768f', scale: 1, spacing: 1,
    });
    drawText(g, 'M  SOUND      ESC  PAUSE', W / 2, H - 11, { align: 'center', color: '#5f5a70', scale: 1, spacing: 1 });
    g.restore();
  }

  drawNote(g) {
    const n = this.note;
    const a = clamp(n.t / 0.35, 0, 1);
    const boxY = 168;
    const boxH = 84;
    g.save();
    g.globalAlpha = a;
    g.fillStyle = 'rgba(6,5,10,0.86)';
    g.fillRect(24, boxY, W - 48, boxH);
    g.fillStyle = rgba(n.color, 0.5);
    g.fillRect(24, boxY, W - 48, 1);
    g.fillRect(24, boxY + boxH - 1, W - 48, 1);
    g.fillStyle = rgba(n.color, 0.9);
    g.fillRect(30, boxY + 10, 3, 3);

    drawText(g, n.title, 40, boxY + 10, { color: n.color, scale: 1, spacing: 2 });
    const lines = wrapText(n.text, W - 100, 1, 1);
    const shown = Math.floor(n.typed);
    let used = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const part = line.slice(0, Math.max(0, shown - used));
      used += line.length + 1;
      if (!part) break;
      drawText(g, part, 40, boxY + 28 + i * 12, { color: '#dcd6e6', scale: 1, spacing: 1 });
    }
    const done = n.typed >= n.text.length;
    if (done) {
      const blink = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 2.4));
      g.globalAlpha = a * blink * 0.8;
      drawText(g, 'E  CONTINUE', W - 40, boxY + boxH - 16, { align: 'right', color: n.color, scale: 1, spacing: 1 });
    }
    g.restore();
  }

  drawPause(g) {
    g.save();
    g.fillStyle = 'rgba(3,3,7,0.72)';
    g.fillRect(0, 0, W, H);
    drawText(g, 'PAUSED', W / 2, 110, { align: 'center', color: '#e6e0f0', scale: 2, spacing: 3 });
    drawText(g, 'ESC  RESUME        M  SOUND        R  BEGIN AGAIN', W / 2, 138, {
      align: 'center', color: '#8d869f', scale: 1, spacing: 1,
    });
    g.restore();
  }

  drawEnding(g) {
    g.fillStyle = '#040308';
    g.fillRect(0, 0, W, H);
    const t = this.ending.t;
    // faint ember horizon
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, W / 2, H + 30, 190, '#7a2a12', 0.35);
    glow(g, W * 0.3, H + 50, 120, '#4a1c10', 0.3);
    g.restore();
    g.drawImage(this.vignette, 0, 0);

    const a = clamp(t / 1.4, 0, 1);
    g.save();
    g.globalAlpha = a;
    drawText(g, 'THE LAST JOURNEY', W / 2, 26, { align: 'center', color: '#5f5872', scale: 1, spacing: 3 });
    drawText(g, this.ending.name, W / 2, 46, { align: 'center', color: '#efe6ea', scale: 2, spacing: 3, shadow: '#000000' });
    g.fillStyle = 'rgba(200,180,190,0.28)';
    g.fillRect(W / 2 - 64, 70, 128, 1);

    if (this.ending.continued) {
      drawText(g, 'TO BE CONTINUED', W / 2, 80, {
        align: 'center', color: '#ffb27a', scale: 1, spacing: 4, shadow: '#000000',
      });
    }

    let y = this.ending.continued ? 98 : 88;
    const lines = this.ending.lines;
    for (let i = 0; i < lines.length; i++) {
      const local = t - 1.6 - i * 1.5;
      if (local < 0) break;
      const la = clamp(local / 1.0, 0, 1);
      g.globalAlpha = la * 0.94;
      const wrapped = wrapText(lines[i], 360, 1, 1);
      for (const line of wrapped) {
        drawText(g, line, W / 2, y, { align: 'center', color: '#d6ccd4', scale: 1, spacing: 1 });
        y += 12;
      }
      y += 4;
    }
    g.restore();

    // little tableau of the three of them, dim
    const ta = clamp((t - 2.5) / 2, 0, 1) * 0.5;
    if (ta > 0) {
      g.save();
      g.globalAlpha = ta;
      const baseY = 236;
      drawGuardian(g, W / 2 - 34, baseY, this.time, 1.2, { scale: 0.8, alpha: 0.5, eye: '#b9c6da' });
      drawGuardian(g, W / 2 + 34, baseY, this.time, 3.9, { scale: 0.8, alpha: 0.5, eye: '#b9c6da' });
      g.globalAlpha = ta * 1.5;
      g.drawImage(GIRL.idle[0], Math.round(W / 2) - 6, baseY - 19);
      g.restore();
    }

    const sa = clamp((t - 4) / 1.2, 0, 1);
    if (sa > 0) {
      g.save();
      g.globalAlpha = sa * 0.9;
      drawText(g, `MEMORIES ${this.ending.count}/${TOTAL_MEMORIES}    POWERS ${this.ending.powers ?? 0}/3`, W / 2, 248, {
        align: 'center', color: '#948ca6', scale: 1, spacing: 1,
      });
      if (t > 6) {
        const blink = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 1.8));
        g.globalAlpha = sa * blink;
        drawText(g, 'PRESS R TO WALK AGAIN', W / 2, 262, { align: 'center', color: '#d8d0e2', scale: 1, spacing: 2 });
      }
      g.restore();
    }
    if (this.mutedNotice > 0) {
      g.save();
      g.globalAlpha = 0.7;
      drawText(g, 'SOUND OFF', 10, 9, { color: '#8a8296', scale: 1 });
      g.restore();
    }
  }
}
