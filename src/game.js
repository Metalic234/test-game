// THE LAST JOURNEY — game loop, player, guardians, atmosphere, cinematics.

import {
  W, H, TAU, clamp, lerp, damp, rgba, mix, vgrad, glow, disc, makeCanvas, hash1,
} from './util.js';
import { drawText, wrapText, textWidth } from './font.js';
import { GIRL, GIRL_SIT, drawGuardian, drawWisp, drawTeen, drawShield, drawDog, drawScorpion } from './sprites.js';
import { buildLevel, buildCityScene, groundAt, TOTAL_MEMORIES, LEVEL_COUNT } from './levels.js';
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
  port: [[0, '#03060c'], [0.42, '#0a1521'], [0.74, '#152534'], [1, '#28394a']],
  mainland: [[0, '#18192d'], [0.38, '#4b3546'], [0.72, '#8b5c55'], [1, '#d99a68']],
  cliffs: [[0, '#0a1c23'], [0.4, '#2f5853'], [0.72, '#6d9581'], [1, '#b3cba9']],
};

const MIST = {
  forest: { color: '#7fb6b6', alpha: 0.055, y: 150, h: 100 },
  desert: { color: '#ffe6c4', alpha: 0.06, y: 160, h: 90 },
  mountain: { color: '#cfe2f4', alpha: 0.075, y: 120, h: 130 },
  village: { color: '#a06a58', alpha: 0.05, y: 140, h: 120 },
  city: { color: '#8fa6c8', alpha: 0.045, y: 150, h: 110 },
  port: { color: '#a8c4dc', alpha: 0.055, y: 132, h: 120 },
  mainland: { color: '#f4c28e', alpha: 0.065, y: 138, h: 112 },
  cliffs: { color: '#b9dcc4', alpha: 0.07, y: 126, h: 126 },
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
  { x: 2340, line: 'THE DECK IS STILL WARM FROM THE ENGINE.' },
  { x: 520, line: 'TWO BLACK SHAPES RISE OUT OF THE DUNES.' },
  { x: 760, line: 'THE BRIDGE HUMPS UNDER HER FEET. SOMETHING MOVES BELOW.' },
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
    this.cityScene = null;
    this.lookout = null;
    this.lookedOut = false;
    this.climbEpilogue = false;
    this.voyage = null;
    this.combat = null;
    this.whale = null;
    this.whaleDone = false;
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
    this.checkpointX = p;
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
    this.lookout = null;
    this.lookedOut = false;
    this.climbEpilogue = false;
    this.voyage = null;
    this.combat = null;
    this.whale = null;
    this.whaleDone = false;
    this.hintT = 0;
    this.audio.applyBiome(this.level.theme);
    this.showCard(this.level);
    if (this.level.hostile) this.initWilds();
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

    if (this.voyage) {
      this.updateVoyage(dt);
      this.updateParticles(dt);
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

    if (this.lookout) {
      this.updateLookout(dt);
      this.updateParticles(dt);
      return;
    }
    this.updatePlayer(dt);
    if (this.combat) {
      this.updateWilds(dt);
      if (this.mode === 'ending') return;
    }
    this.updateWhale(dt);
    if (this.level.lookoutX && !this.lookedOut && this.player.x >= this.level.lookoutX) {
      this.beginLookout();
      return;
    }
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
      // The scorpion's arena is a gate until the old keeper is finished.
      if (this.combat && this.combat.boss && !this.combat.bossDefeated) {
        this.player.x = this.level.exitX - 10;
        return;
      }
      // The last street does not lead anywhere: it leads to them.
      if (this.level.finale) this.beginFinale();
      else if (this.level.ship) this.beginVoyage();
      else if (this.levelIndex < LEVEL_COUNT - 1) this.beginTransition();
      else this.beginStoryEnding();
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
    let onSolid = false;
    for (const s of level.solids) {
      if (p.x + PW / 2 > s.x && p.x - PW / 2 < s.x + s.w) {
        if (p.vy >= 0 && p.y >= s.y && p.y <= s.y + 12) {
          p.y = s.y;
          p.vy = 0;
          p.onGround = true;
          p.airJump = true;
          onSolid = true;
        }
      }
    }

    const gy = groundAt(level, p.x);
    if (p.y >= gy) {
      p.y = gy;
      p.vy = 0;
      p.onGround = true;
      p.airJump = true;
      if (gy < H - 40) this.checkpointX = p.x;
    } else if (onSolid) {
      // A bridge or rock holds her even when the chasm floor is far below.
      p.onGround = true;
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
      p.x = this.checkpointX ?? level.spawnX;
      p.y = groundAt(level, p.x);
      p.vx = 0;
      p.vy = 0;
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
    const wildBoss = this.combat && this.combat.boss && this.combat.boss.active && this.combat.boss.alive
      ? this.combat.boss : null;
    const target = wildBoss
      ? (p.x + wildBoss.x) * 0.5 - W * 0.5
      : this.bossBattle
        ? p.x - W * 0.24 + 28
        : p.x - W * 0.44 + look;
    const maxX = Math.max(0, this.level.width - W);
    const speed = wildBoss ? 2.8 : this.bossBattle ? 3.2 : 2.4;
    this.cam.x = clamp(damp(this.cam.x, target, speed, dt), 0, maxX);
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
    // The city is no longer walked: the last street is a scene she arrives in.
    if (!this.cityScene) this.cityScene = buildCityScene();
    this.level = this.cityScene;
    const L = this.level;
    const p = this.player;
    p.x = L.arenaX - 74;
    p.y = groundAt(L, p.x);
    p.vx = 0;
    p.vy = 0;
    p.facing = 1;
    p.onGround = true;
    p.anim = 0;
    this.cam.x = clamp(p.x - W * 0.32, 0, Math.max(0, L.width - W));
    this.guardians = this.makeGuardians(p.x);
    this.particles.length = 0;
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

    // Blue has to survive long enough for the duel to be a duel. At 3 damage
    // per volley he needs a real pool, not a two-second formality.
    const hp = [84, 0, 0, 210];
    // The whole last street is the arena: one opponent at a time, and room to run.
    const arenaMin = Math.max(24, playerX - 110);
    const arenaMax = Math.min(this.level.width - 150, playerX + 380);
    this.bossBattle = {
      t: 0,
      playerX,
      arenaMin,
      arenaMax,
      phase: 'blue',
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
        windupT: 0,
        windupMax: 0.46,
        strikeX: teen.x,
        storm: null,
        stormCooldown: 0,
        // Blue gives her a breath before his first mark, so the read is learnable.
        attackCooldown: i === 0 ? 1.6 : 1.0 + i * 0.35,
        slamT: 0,
        slamMax: 0.9,
        slamX: teen.x,
        slamClock: 1.9,
        slamRecover: 0,
        slamPending: false,
        stompT: 0,
      })),
      hero: { hp: 100, max: 100, hurt: 0 },
      heroDown: false,
      shards: [],
      laserActive: false,
      laserDamageT: 0,
      defeated: 0,
      totalDefeats: 2,
      // Blue first. Brown is not on the street until the duel is finished.
      brownEngaged: false,
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

    // He is already finished. This is the two of them seeing it through.
    if (battle.finish) {
      this.updateBrownFinish(dt);
      return;
    }

    const p = this.player;
    // The last street is the arena. One opponent, and enough room to leave a mark.
    // She keeps her feet, her jump and her dash: the arena only limits distance.
    p.x = clamp(p.x, battle.arenaMin, battle.arenaMax);
    const airborne = p.y < groundAt(this.level, p.x) - 10;

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

    // Blue marks the ground at her feet, then strikes it. The mark is fixed the
    // moment it appears, so a step out of it always saves her: every hit is one
    // she could have read. In his last third he stops lunging and calls the
    // storm — three marks in a row, each fixed where she was standing.
    // Roughly a dozen seconds of volleys, long enough for her health to matter.
    if (blue && blue.alive) {
      if (blue.storm) {
        const s = blue.storm;
        s.t += dt;
        if (s.spawned < 3 && s.t >= 0.35 + s.spawned * 0.55) {
          s.marks.push({ x: p.x, w: 0.55 });
          s.spawned++;
          this.audio.play('jump');
        }
        for (let i = s.marks.length - 1; i >= 0; i--) {
          const mark = s.marks[i];
          mark.w -= dt;
          if (mark.w > 0) continue;
          s.marks.splice(i, 1);
          const hit = Math.abs(p.x - mark.x) < 22 && battle.hero.hp > 0;
          if (hit) {
            battle.hero.hp = Math.max(0, battle.hero.hp - 9);
            battle.hero.hurt = 1;
          }
          this.audio.play('blast');
          for (let k = 0; k < (hit ? 16 : 9); k++) {
            const a = Math.random() * TAU;
            const sp = 10 + Math.random() * 52;
            this.spawn({
              type: 'spark',
              x: mark.x + (Math.random() - 0.5) * 6,
              y: groundAt(this.level, mark.x) - 4 - Math.random() * 16,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp - 18,
              size: k % 4 ? 1 : 2,
              color: k % 2 ? '#ffffff' : '#9fc8ff',
              max: 0.3 + Math.random() * 0.35,
              grav: 70,
              drag: 0.94,
            });
          }
        }
        if (s.spawned >= 3 && s.marks.length === 0) {
          blue.storm = null;
          blue.stormCooldown = 1.25;
        }
      } else if (blue.hp <= blue.maxHp / 3) {
        // The blade goes down, and the sky answers.
        if (blue.stormCooldown > 0) {
          blue.stormCooldown -= dt;
        } else {
          blue.storm = { t: 0, spawned: 0, marks: [] };
          blue.windupT = 0;
          blue.lungeT = 0;
          blue.pendingHit = false;
          this.audio.play('power');
        }
      } else {
        blue.attackCooldown -= dt;

        if (blue.attackCooldown <= 0 && blue.lungeT <= 0 && blue.windupT <= 0) {
          blue.windupT = blue.windupMax;
          blue.strikeX = p.x;
          blue.pendingHit = false;
          this.audio.play('power');
        }
        if (blue.windupT > 0) {
          blue.windupT = Math.max(0, blue.windupT - dt);
          if (blue.windupT <= 0) {
            blue.lungeT = 0.26;
            const fury = 1 - blue.hp / blue.maxHp;
            blue.attackCooldown = 1.62 - 0.22 * fury;
            blue.pendingHit = true;
          }
        }
        if (blue.lungeT > 0) {
          blue.lungeT = Math.max(0, blue.lungeT - dt);
          if (blue.pendingHit && blue.lungeT <= 0.12) {
            blue.pendingHit = false;
            const markX = blue.strikeX;
            const inMark = Math.abs(p.x - markX) < 24;
            const inReach = Math.abs(blue.x - p.x) < 44;
            if (inMark && inReach && !airborne && battle.hero.hp > 0) {
              battle.hero.hp = Math.max(0, battle.hero.hp - 11);
              battle.hero.hurt = 1;
              this.audio.play('whisper');
              for (let i = 0; i < 10; i++) {
                this.spawn({
                  type: 'spark', x: p.x, y: p.y - 12,
                  vx: (Math.random() - 0.5) * 70, vy: -Math.random() * 60,
                  size: 1, color: i % 2 ? '#ffffff' : '#9fc8ff',
                  max: 0.4, grav: 80, drag: 0.95,
                });
              }
            } else {
              // Her step took her clear; the strike dies on the stones.
              for (let i = 0; i < 6; i++) {
                this.spawn({
                  type: 'spark', x: markX, y: groundAt(this.level, markX) - 3,
                  vx: (Math.random() - 0.5) * 46, vy: -6 - Math.random() * 22,
                  size: 1, color: i % 2 ? '#9fc8ff' : '#ffffff',
                  max: 0.3, grav: 60, drag: 0.94,
                });
              }
            }
          }
        }
      }

      let blueTarget;
      if (blue.storm) blueTarget = p.x + 44;
      else if (blue.lungeT > 0) blueTarget = blue.strikeX + 13;
      else if (blue.windupT > 0) blueTarget = blue.strikeX + 26;
      else blueTarget = p.x + 34;
      blue.x = damp(blue.x, blueTarget, blue.storm ? 5 : (blue.lungeT > 0 ? 9 : 3.8), dt);
      blue.y = groundAt(this.level, blue.x);
    }

    // Brown is a true juggernaut. He only advances after Blue falls, slowly
    // enough for the girl and both guardians to turn their attention together.
    if (brown && brown.alive && battle.brownEngaged) {
      const fury = 1 - brown.hp / brown.maxHp;
      brown.slamRecover = Math.max(0, brown.slamRecover - dt);
      brown.stompT = Math.max(0, brown.stompT - dt);

      if (brown.slamT > 0) {
        // The mark is fixed where she stood: the whole windup is hers to leave.
        brown.slamT = Math.max(0, brown.slamT - dt);
        if (brown.slamT <= 0 && brown.slamPending) {
          brown.slamPending = false;
          brown.stompT = 0.65;
          const markX = brown.slamX;
          const hit = Math.abs(p.x - markX) < 44 && !airborne && battle.hero.hp > 0;
          if (hit) {
            battle.hero.hp = Math.max(0, battle.hero.hp - 17);
            battle.hero.hurt = 1;
            this.audio.play('whisper');
            for (let i = 0; i < 14; i++) {
              const a = Math.random() * TAU;
              const sp = 14 + Math.random() * 58;
              this.spawn({
                type: 'spark',
                x: p.x, y: p.y - 10,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 14,
                size: i % 3 ? 1 : 2, color: i % 2 ? '#ffffff' : '#f0c396',
                max: 0.35 + Math.random() * 0.45, grav: 60, drag: 0.93,
              });
            }
          }
          this.audio.play('blast');
          for (let i = 0; i < 22; i++) {
            const side = i % 2 ? 1 : -1;
            this.spawn({
              type: 'spark',
              x: markX + side * (4 + Math.random() * 14),
              y: groundAt(this.level, markX) - 2,
              vx: side * (30 + Math.random() * 70),
              vy: -10 - Math.random() * 34,
              size: i % 3 ? 1 : 2,
              color: i % 2 ? '#c89a68' : '#ffe0b8',
              max: 0.4 + Math.random() * 0.5,
              grav: 52,
              drag: 0.94,
            });
          }
          brown.slamClock = 2.3 - fury;
          brown.slamRecover = 0.5;
        }
      } else if (brown.slamRecover <= 0) {
        // He closes in slowly, then plants his feet and commits the blow.
        const targetX = Math.min(p.x + 104, this.level.width - 60);
        const step = 46 * dt;
        brown.x += clamp(targetX - brown.x, -step, step);
        brown.y = groundAt(this.level, brown.x);
        brown.slamClock -= dt;
        if (brown.slamClock <= 0) {
          brown.slamT = brown.slamMax;
          brown.slamX = p.x;
          brown.slamPending = true;
          this.audio.play('power');
        }
      } else {
        brown.y = groundAt(this.level, brown.x);
      }
    }

    battle.hero.hurt = Math.max(0, battle.hero.hurt - dt * 2.2);

    // Every press throws a volley, in either phase, with no wait between them.
    if (this.input.consume('shard')) this.throwWhiteShards();

    const laserNow = this.input.down('laser');
    if (laserNow && !battle.laserActive) {
      battle.laserDamageT = 0;
      this.audio.play('power');
    }
    battle.laserActive = laserNow;
    if (laserNow) {
      battle.laserDamageT += dt;
      // The beam is on call in both phases; the knights never sit this one out.
      while (battle.laserDamageT >= 0.1) {
        battle.laserDamageT -= 0.1;
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

    if (battle.hero.hp <= 0 && !battle.heroDown) {
      battle.heroDown = true;
      this.showHeroDown();
      return;
    }
    if (battle.defeated >= battle.totalDefeats && !battle.finish) this.showPortArrival();
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
    if (!battle) return;
    // The knights' beam answers at any point in the fight, and it hits like a train.
    const target = battle.bosses.find((boss) => boss.alive && !boss.fleeing
      && (battle.brownEngaged ? boss.kind === 'brown' : boss.kind === 'blue'));
    if (!target) return;
    const beamY = groundAt(this.level, this.player.x) - 40;
    const bossY = groundAt(this.level, target.x) - 22;
    if (Math.abs(bossY - beamY) <= 44) {
      this.damageBoss(target, 6, target.x - 8, bossY);
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
        // The duel is over. The street opens, and the heavy one steps out of the dark.
        const brown = battle.bosses.find((entry) => entry.kind === 'brown');
        if (brown) {
          brown.x = Math.min(this.level.width - 24, battle.arenaMax + 100);
          brown.y = groundAt(this.level, brown.x);
          brown.slamClock = 1.9;
          brown.slamRecover = 0;
        }
        battle.brownEngaged = true;
        battle.phase = 'brown';
        this.player.facing = 1;
      }
      if (boss.kind === 'brown') this.beginBrownFinish(boss);
    }
  }

  // He goes down, and the two of them take it from her. A short story, not a fight.
  beginBrownFinish(brown) {
    const battle = this.bossBattle;
    if (!battle || battle.finish) return;
    battle.finish = { t: 0, brown, stared: false, fired: false, gone: false, fade: 0 };
    battle.brownEngaged = false;
    battle.laserActive = false;
    battle.shards.length = 0;
    this.player.facing = 1;
  }

  updateBrownFinish(dt) {
    const battle = this.bossBattle;
    const f = battle.finish;
    const L = this.level;
    const p = this.player;
    const brown = f.brown;
    f.t += dt;

    // She holds her ground. This one is not hers.
    p.vx = 0;
    p.facing = 1;
    p.y = groundAt(L, p.x);
    p.onGround = true;

    // One of them either side of him, both turned inward on the same spot.
    const flank = [brown.x - 30, brown.x + 30];
    for (let i = 0; i < this.guardians.length; i++) {
      const gd = this.guardians[i];
      gd.x = damp(gd.x, flank[i], i === 0 ? 2.6 : 2.2, dt);
      gd.y = damp(gd.y, groundAt(L, gd.x) - 22, 3.4, dt);
      gd.lean = damp(gd.lean, f.fired ? 9 : 6, 3, dt);
    }

    // Frame the three of them, with the dying one in the middle of them.
    this.cam.x = damp(
      this.cam.x,
      clamp((p.x + brown.x) * 0.5 - W * 0.5, 0, Math.max(0, L.width - W)),
      2.2, dt,
    );

    if (!f.stared && f.t > 1.0) {
      f.stared = true;
      this.audio.play('whisper');
    }
    if (!f.fired && f.t > 1.9) {
      f.fired = true;
      this.audio.play('power');
    }

    if (f.fired) {
      const burn = f.t - 1.9;
      f.fade = clamp(burn / 2.4, 0, 1);
      if (Math.random() < dt * 42) {
        this.spawn({
          type: 'spark',
          x: brown.x + (Math.random() - 0.5) * 18,
          y: groundAt(L, brown.x) - 8 - Math.random() * 30,
          vx: (Math.random() - 0.5) * 40,
          vy: -10 - Math.random() * 30,
          size: 1,
          color: Math.random() < 0.5 ? '#ffffff' : brown.color,
          max: 0.3 + Math.random() * 0.4,
          grav: 30,
          drag: 0.94,
        });
      }
      if (!f.gone && burn > 2.4) {
        // the last of him, going out
        f.gone = true;
        this.audio.play('blast');
        const bx = brown.x;
        const by = groundAt(L, bx) - 22;
        for (let i = 0; i < 46; i++) {
          const a = Math.random() * TAU;
          const sp = 24 + Math.random() * 92;
          this.spawn({
            type: 'spark',
            x: bx,
            y: by,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 10,
            size: 1 + (i % 6 === 0 ? 1 : 0),
            color: i % 2 ? brown.color : '#ffffff',
            max: 0.7 + Math.random() * 0.7,
            grav: 26,
            drag: 0.95,
          });
        }
      }
    }

    if (f.t > 5.0) this.showClimbEpilogue();
  }

  drawBrownFinish(g) {
    const L = this.level;
    const f = this.bossBattle.finish;
    const brown = f.brown;
    const bx = brown.x - this.cam.x;
    const baseY = groundAt(L, brown.x);
    const targetY = baseY - 24;
    const flicker = 0.5 + Math.sin(this.time * 30) * 0.5;

    // Both beams, from both of them, into the space between.
    if (f.fired && !f.gone) {
      const spread = 4 + f.fade * 3;
      const reach = 12 + f.fade * 16;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) {
        const gd = this.guardians[i];
        const kx = gd.x - this.cam.x;
        const ky = gd.y - 20;
        g.fillStyle = 'rgba(150,200,240,0.16)';
        g.beginPath();
        g.moveTo(kx, ky - spread * 2);
        g.lineTo(bx, targetY - reach * 2);
        g.lineTo(bx, targetY + reach * 2);
        g.lineTo(kx, ky + spread * 2);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(246,252,255,0.7)';
        g.beginPath();
        g.moveTo(kx, ky - spread);
        g.lineTo(bx, targetY - reach);
        g.lineTo(bx, targetY + reach);
        g.lineTo(kx, ky + spread);
        g.closePath();
        g.fill();
        glow(g, kx, ky, 16, '#dff1ff', 0.5);
      }
      glow(g, bx, targetY, 30 + f.fade * 22, '#ffffff', 0.32 * (1 - f.fade * 0.4));
      g.restore();
    }

    // He is still standing while the light eats him from the middle out.
    if (!f.gone && bx > -80 && bx < W + 80) {
      g.save();
      g.globalAlpha = clamp(1 - f.fade * (0.6 + flicker * 0.3), 0.06, 1);
      drawTeen(g, bx, baseY, this.time, {
        color: brown.color,
        style: brown.style,
        scale: brown.scale,
        flare: 0.5 + f.fade * 0.9,
        facing: -1,
      });
      g.restore();
      if (f.fade > 0.05) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        glow(g, bx, targetY, 22 + f.fade * 30, '#ffffff', 0.25 * f.fade);
        g.restore();
      }
    }
  }

  // The street is done with them. The road goes down to the water.
  showPortArrival() {
    if (this.mode === 'ending') return;
    this.bossBattle = null;
    this.mode = 'play';
    this.player.facing = 1;
    this.beginTransition();
  }

  // Both of them are down. Before the water, the long way up, and the city below.
  showClimbEpilogue() {
    if (this.mode === 'ending') return;
    this.bossBattle = null;
    this.mode = 'play';
    this.climbEpilogue = true;
    this.beginLookout();
    this.lookout.lines = [
      [0.6, 'SHE LEAVES THE LAST STREET AND CLIMBS UNTIL THE AIR THINS.'],
      [3.4, 'THE WIND TURNS TO TEETH. THE MOUNTAIN GIVES OUT.'],
      [6.4, 'BELOW HER: THE CITY, STILL BURNING. BOTH OF THEM GONE.'],
      [9.4, 'THE ROAD IS HERS NOW. IT GOES DOWN TO THE WATER.'],
    ];
    this.audio.play('power');
  }

  // The water after the port. Islands, then a coast no map has ever agreed on.
  beginVoyage() {
    this.ending = null;
    this.mode = 'play';
    this.voyage = { t: 0, next: this.levelIndex + 1 };
    this.fade = 1;
    this.fadeTarget = 0;
    this.audio.applyBiome('metal');
    this.audio.play('transition');
  }

  updateVoyage(dt) {
    const v = this.voyage;
    v.t += dt;
    if (v.t > 2 && this.input.pressed('restart')) {
      this.voyage = null;
      this.startGame();
      return;
    }
    if (v.t > 25.6 && (this.input.consume('interact') || v.t > 30.5)) {
      this.finishVoyage();
    }
  }

  initWilds() {
    const L = this.level;
    const dogs = (L.dogs || []).map((d, i) => ({
      id: `dog-${i}`,
      x: d.home ?? d.x,
      home: d.home ?? d.x,
      hp: 4,
      maxHp: 4,
      alive: true,
      flash: 0,
      biteCd: 0.5 + i * 0.17,
      pause: 0,
      dir: i % 2 ? -1 : 1,
      moving: false,
    }));
    const cfg = L.boss;
    const boss = cfg ? {
      id: 'scorpion',
      x: cfg.x,
      hp: 160,
      maxHp: 160,
      alive: true,
      active: false,
      intro: 0,
      flash: 0,
      attackCd: 1.8,
      stingT: 0,
      stingMax: 0.95,
      stingX: cfg.x,
      stingHit: true,
      clawT: 0,
      clawMax: 0.55,
      clawHit: true,
      facing: -1,
      stomp: 0,
    } : null;
    this.combat = {
      hp: 100,
      max: 100,
      hurt: 0,
      invuln: 0,
      dogs,
      boss,
      bossDefeated: false,
      bossStarted: false,
      shards: [],
      beamOn: false,
      beamTick: 0,
      beamDir: 1,
    };
  }

  startScorpion() {
    const c = this.combat;
    if (!c || !c.boss || c.bossStarted) return;
    const b = c.boss;
    c.bossStarted = true;
    b.active = true;
    b.intro = 1.6;
    b.attackCd = 1.7;
    this.blocker = null;
    this.card = null;
    this.beats = [];
    this.player.facing = 1;
    this.audio.play('power');
    for (let i = 0; i < 44; i++) {
      const a = Math.random() * TAU;
      const sp = 14 + Math.random() * 58;
      this.spawn({
        type: 'mote',
        x: b.x + (Math.random() - 0.5) * 90,
        y: groundAt(this.level, b.x) - Math.random() * 8,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.4 - 12,
        size: Math.random() < 0.2 ? 2 : 1,
        color: i % 3 ? '#d4a06a' : '#f4d9a8',
        max: 0.6 + Math.random() * 0.9,
        grav: 42,
        drag: 0.95,
      });
    }
  }

  updateWilds(dt) {
    const c = this.combat;
    if (!c) return;
    const L = this.level;
    const p = this.player;
    c.invuln = Math.max(0, c.invuln - dt);
    c.hurt = Math.max(0, c.hurt - dt * 2.2);

    if (!c.bossStarted && c.boss && p.x >= L.boss.triggerX) this.startScorpion();
    if (c.bossStarted && c.boss && c.boss.alive) {
      p.x = clamp(p.x, L.boss.arenaMin, L.exitX - 10);
    }

    for (const dog of c.dogs) {
      dog.flash = Math.max(0, dog.flash - dt * 4);
      dog.biteCd = Math.max(0, dog.biteCd - dt);
      if (!dog.alive) continue;
      const gy = groundAt(L, dog.x);
      const dx = p.x - dog.x;
      const close = Math.abs(dx) < 190 && Math.abs(p.y - gy) < 42;
      if (close) {
        dog.moving = true;
        dog.dir = Math.sign(dx) || dog.dir;
        dog.x += dog.dir * 38 * dt;
        if (Math.abs(dx) < 23 && Math.abs(p.y - gy) < 26 && dog.biteCd <= 0) {
          this.hurtWilds(7, dog.x);
          dog.biteCd = 1.15;
        }
      } else {
        dog.pause -= dt;
        if (dog.pause <= 0) {
          if (Math.abs(dog.x - dog.home) > 46) dog.dir = Math.sign(dog.home - dog.x) || dog.dir;
          else {
            dog.dir = Math.random() < 0.5 ? -1 : 1;
            dog.pause = 0.7 + Math.random() * 1.1;
          }
        }
        dog.x += dog.dir * 12 * dt;
        dog.moving = true;
      }
      dog.x = clamp(dog.x, 16, L.width - 16);
    }

    if (c.boss && c.boss.active && c.boss.alive) this.updateScorpion(dt);

    if (this.input.consume('shard')) this.throwWildsShards();
    c.beamDir = p.facing || 1;
    c.beamOn = this.input.down('laser') && (
      c.dogs.some((dog) => dog.alive) || (c.boss && c.boss.active && c.boss.alive)
    );
    if (c.beamOn) {
      c.beamTick += dt;
      while (c.beamTick >= 0.1) {
        c.beamTick -= 0.1;
        this.damageWithWildsBeam();
      }
    } else {
      c.beamTick = 0;
    }

    const keep = [];
    for (const shard of c.shards) {
      shard.life += dt;
      const target = shard.target;
      if (!target || !target.alive || shard.life > 2.0) continue;
      const ty = groundAt(L, target.x) - (target === c.boss ? 28 : 9);
      const dx = target.x - shard.x;
      const dy = ty - shard.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      shard.vx = lerp(shard.vx, (dx / len) * 280, Math.min(1, dt * 5));
      shard.vy = lerp(shard.vy, (dy / len) * 280, Math.min(1, dt * 5));
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (Math.hypot(target.x - shard.x, ty - shard.y) < 15) {
        this.damageWilds(target, 1, shard.x, shard.y);
        continue;
      }
      keep.push(shard);
    }
    c.shards = keep;

    if (c.hp <= 0) this.showWildsDown();
  }

  updateScorpion(dt) {
    const c = this.combat;
    const b = c.boss;
    const L = this.level;
    const p = this.player;
    b.flash = Math.max(0, b.flash - dt * 3.8);
    b.stomp = Math.max(0, b.stomp - dt);
    b.intro = Math.max(0, b.intro - dt);
    b.x = clamp(b.x, L.boss.arenaMin + 30, L.width - 42);
    b.y = groundAt(L, b.x);
    b.facing = Math.sign(p.x - b.x) || b.facing;
    if (b.intro > 0) return;

    const dx = p.x - b.x;
    if (Math.abs(dx) > 120) b.x += Math.sign(dx) * 25 * dt;
    if (Math.abs(dx) < 26 && c.invuln <= 0 && Math.abs(p.y - b.y) < 28) {
      this.hurtWilds(9, b.x);
    }

    if (b.stingT > 0) {
      b.stingT = Math.max(0, b.stingT - dt);
      if (b.stingT <= 0 && !b.stingHit) {
        b.stingHit = true;
        b.stomp = 0.55;
        const hit = Math.abs(p.x - b.stingX) < 36 && p.y > groundAt(L, p.x) - 18;
        if (hit) this.hurtWilds(15, b.stingX);
        this.audio.play('blast');
        for (let i = 0; i < 22; i++) {
          const side = i % 2 ? 1 : -1;
          this.spawn({
            type: 'spark',
            x: b.stingX + side * (4 + Math.random() * 16),
            y: groundAt(L, b.stingX) - 2,
            vx: side * (20 + Math.random() * 60),
            vy: -12 - Math.random() * 36,
            size: i % 4 ? 1 : 2,
            color: i % 2 ? '#e0a060' : '#ffd9a0',
            max: 0.4 + Math.random() * 0.5,
            grav: 54,
            drag: 0.94,
          });
        }
      }
    } else if (b.clawT > 0) {
      b.clawT = Math.max(0, b.clawT - dt);
      if (b.clawT <= 0 && !b.clawHit) {
        b.clawHit = true;
        if (Math.abs(p.x - b.x) < 78 && Math.abs(p.y - b.y) < 28) this.hurtWilds(12, b.x);
        this.audio.play('whisper');
      }
    } else {
      b.attackCd -= dt;
      if (b.attackCd <= 0) {
        if (Math.abs(dx) < 115) {
          b.clawT = b.clawMax;
          b.clawHit = false;
        } else {
          b.stingT = b.stingMax;
          b.stingX = p.x;
          b.stingHit = false;
        }
        b.attackCd = 2.0 + Math.random() * 1.1;
        this.audio.play('power');
      }
    }
  }

  hurtWilds(amount, sourceX) {
    const c = this.combat;
    if (!c || c.invuln > 0 || this.mode === 'ending') return;
    c.hp = Math.max(0, c.hp - amount);
    c.invuln = 0.9;
    c.hurt = 1;
    const p = this.player;
    p.vx = (p.x < sourceX ? -1 : 1) * 120;
    p.vy = -48;
    p.onGround = false;
    this.audio.play('whisper');
    for (let i = 0; i < 12; i++) {
      this.spawn({
        type: 'spark',
        x: p.x,
        y: p.y - 10,
        vx: (Math.random() - 0.5) * 70,
        vy: -Math.random() * 55,
        size: 1,
        color: i % 2 ? '#ffffff' : '#ff8a5a',
        max: 0.35 + Math.random() * 0.35,
        grav: 80,
        drag: 0.94,
      });
    }
    if (c.hp <= 0) this.showWildsDown();
  }

  throwWildsShards() {
    const c = this.combat;
    if (!c) return;
    const p = this.player;
    let target = null;
    let best = 430;
    for (const dog of c.dogs) {
      if (!dog.alive) continue;
      const d = Math.abs(dog.x - p.x);
      if (d < best) {
        best = d;
        target = dog;
      }
    }
    if (c.boss && c.boss.active && c.boss.alive) {
      const d = Math.abs(c.boss.x - p.x);
      if (d < best) target = c.boss;
    }
    if (!target) return;

    for (let i = 0; i < 3; i++) {
      const sx = p.x + p.facing * 8;
      const sy = p.y - 20 + (i - 1) * 3;
      const ty = groundAt(this.level, target.x) - (target === c.boss ? 28 : 9);
      const dx = target.x - sx;
      const dy = ty - sy;
      const len = Math.max(1, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx) + (i - 1) * 0.055;
      c.shards.push({
        x: sx,
        y: sy,
        vx: Math.cos(a) * 280,
        vy: Math.sin(a) * 280,
        target,
        life: 0,
        spin: (i - 1) * 0.55,
      });
    }
    this.audio.play('blast');
    for (let i = 0; i < 7; i++) {
      this.spawn({
        type: 'spark',
        x: p.x + p.facing * 8,
        y: p.y - 20,
        vx: p.facing * (18 + Math.random() * 28),
        vy: (Math.random() - 0.5) * 34,
        size: 1,
        color: i % 2 ? '#ffffff' : '#cfeaff',
        max: 0.28 + Math.random() * 0.22,
        drag: 0.92,
      });
    }
  }

  damageWithWildsBeam() {
    const c = this.combat;
    if (!c) return;
    const L = this.level;
    const p = this.player;
    const dir = p.facing || 1;
    const beamY = groundAt(L, p.x) - 40;
    for (const dog of c.dogs) {
      if (!dog.alive) continue;
      const ahead = (dog.x - p.x) * dir;
      if (ahead > -10 && ahead < 430 && Math.abs(groundAt(L, dog.x) - 22 - beamY) < 58) {
        this.damageWilds(dog, 6, dog.x, groundAt(L, dog.x) - 9);
      }
    }
    if (c.boss && c.boss.active && c.boss.alive) {
      const ahead = (c.boss.x - p.x) * dir;
      if (ahead > -10 && ahead < 540 && Math.abs(groundAt(L, c.boss.x) - 32 - beamY) < 76) {
        this.damageWilds(c.boss, 3, c.boss.x - 12, groundAt(L, c.boss.x) - 28);
      }
    }
  }

  damageWilds(target, amount, hitX, hitY) {
    if (!target || !target.alive) return;
    const c = this.combat;
    const boss = c && target === c.boss;
    target.hp = Math.max(0, target.hp - amount);
    target.flash = 1;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * TAU;
      const sp = 16 + Math.random() * 52;
      this.spawn({
        type: 'spark',
        x: hitX,
        y: hitY,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: i % 4 === 0 ? 2 : 1,
        color: i % 2 ? (boss ? '#ffd9a0' : '#ff7a50') : '#ffffff',
        max: 0.25 + Math.random() * 0.45,
        grav: 22,
        drag: 0.94,
      });
    }
    if (target.hp > 0) return;
    target.alive = false;
    if (boss) {
      this.defeatScorpion();
      return;
    }
    this.audio.play('whisper');
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * TAU;
      const sp = 18 + Math.random() * 48;
      this.spawn({
        type: 'smoke',
        x: target.x,
        y: groundAt(this.level, target.x) - 10,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 8,
        size: 2 + Math.floor(Math.random() * 3),
        color: '#09070b',
        max: 0.7 + Math.random() * 0.8,
        alpha: 0.7,
        drag: 0.94,
      });
    }
  }

  defeatScorpion() {
    const c = this.combat;
    if (!c || !c.boss || c.bossDefeated) return;
    const b = c.boss;
    b.alive = false;
    b.active = false;
    c.bossDefeated = true;
    c.beamOn = false;
    c.shards.length = 0;
    this.audio.play('blast');
    for (let i = 0; i < 64; i++) {
      const a = Math.random() * TAU;
      const sp = 18 + Math.random() * 92;
      this.spawn({
        type: i % 3 ? 'spark' : 'smoke',
        x: b.x + (Math.random() - 0.5) * 26,
        y: groundAt(this.level, b.x) - 20 - Math.random() * 28,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 16,
        size: i % 4 === 0 ? 2 : 1,
        color: i % 3 ? '#e0a060' : '#fff0d0',
        max: 0.7 + Math.random() * 0.9,
        grav: 24,
        drag: 0.95,
      });
    }
    this.note = {
      title: 'THE SCORPION',
      text: 'It folds its legs and becomes part of the sand. The way south is open.',
      color: '#e0a060',
      t: 0,
      typed: 0,
    };
    this.beats = [];
  }

  showWildsDown() {
    if (this.mode === 'ending') return;
    this.combat = null;
    this.mode = 'ending';
    this.ending = {
      name: 'THE MAINLAND',
      continued: true,
      lines: [
        'THE DUNES TAKE HER WEIGHT, AND THEN THEY TAKE THE REST.',
        'THE BLACK DOGS ARE ALREADY GONE. THE SCORPION IS STILL WAITING.',
        'THE MAINLAND WILL KEEP HER THIS TIME.',
      ],
      count: this.found.size,
      powers: this.powers.size,
      t: 0,
    };
    this.fade = 1;
    this.fadeTarget = 0;
    this.audio.play('transition');
    this.audio.applyBiome('mainland');
  }

  beginStoryEnding() {
    if (this.mode === 'ending') return;
    this.combat = null;
    this.mode = 'ending';
    this.ending = {
      name: 'THE GREEN CLIFFS',
      continued: true,
      lines: [
        'THE BRIDGES HOLD. THE CLIFFS GO ON, GREEN AND PATIENT.',
        'SHE DOES NOT LOOK BACK AT THE DESERT.',
        'BELOW, THE WHALE IS ONLY A SHADOW AGAIN.',
        'THE ROAD ENDS HERE — FOR NOW.',
      ],
      count: this.found.size,
      powers: this.powers.size,
      t: 0,
    };
    this.fade = 1;
    this.fadeTarget = 0;
    this.audio.applyBiome('cliffs');
    this.audio.play('ending');
  }

  updateWhale(dt) {
    if (!this.level || !this.level.cliffs) return;
    if (this.whale) {
      this.whale.t += dt;
      if (this.whale.t > 3.6) this.whale = null;
      return;
    }
    if (this.whaleDone || this.level.whaleBridge == null) return;
    const b = this.level.bridges[this.level.whaleBridge];
    if (!b) return;
    if (this.player.x > b.x + 24 && this.player.x < b.x + b.w - 24) {
      this.whale = { t: 0, bridge: b };
      this.whaleDone = true;
      this.audio.play('whale');
    }
  }

  finishVoyage() {
    const v = this.voyage;
    if (!v) return;
    const next = v.next;
    this.voyage = null;
    if (!Number.isInteger(next) || next >= LEVEL_COUNT) {
      this.startGame();
      return;
    }
    this.mode = 'play';
    this.ending = null;
    this.loadLevel(next);
    this.fade = 1;
    this.fadeTarget = 0;
    this.frozen = false;
    this.audio.applyBiome(this.level.theme);
    this.audio.play('transition');
  }

  drawVoyageIsland(g, x, y, s, i) {
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.scale(s, s);

    // surf breaking around a shape that is mostly rock
    g.strokeStyle = 'rgba(160,200,214,0.18)';
    g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * TAU;
      const r = 26 + hash1(i * 7.1 + k * 1.9) * 10;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * 0.58;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.stroke();

    g.fillStyle = '#0a1517';
    g.beginPath();
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * TAU;
      const r = 20 + hash1(i * 3.3 + k * 2.7) * 9;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * 0.56;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();

    // canopy, from directly above
    g.fillStyle = '#0e201d';
    g.beginPath();
    g.arc(-3, -2, 10 + hash1(i * 9.1) * 4, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(6, 3, 7 + hash1(i * 4.4) * 3, 0, TAU);
    g.fill();

    // palms are only stars of shadow at this height
    g.strokeStyle = '#071011';
    g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const px = -12 + hash1(i * 4.4 + k * 6.2) * 24;
      const py = -7 + hash1(i * 8.8 + k * 3.1) * 12;
      for (let f = 0; f < 5; f++) {
        const a = (f / 5) * TAU + 0.4;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(a) * 4, py + Math.sin(a) * 2.6);
        g.stroke();
      }
    }

    if (hash1(i * 2.9) > 0.32) {
      g.fillStyle = 'rgba(255,186,104,0.8)';
      g.fillRect(-8 + Math.round(hash1(i * 5.5) * 14), -3, 1, 1);
      g.fillRect(-6 + Math.round(hash1(i * 5.5) * 14), -1, 1, 1);
    }
    g.restore();
  }

  drawVoyage(g) {
    const t = this.voyage.t;
    const land = clamp((t - 11) / 9, 0, 1);
    const sea = t * 15;

    // From above there is no horizon: only water, and whatever is moving on it.
    vgrad(g, 0, 0, W, H, [
      [0, '#061520'], [0.42, '#0a202c'], [0.78, '#071722'], [1, '#030a10'],
    ], 2);

    g.save();
    g.globalAlpha = 0.13;
    g.strokeStyle = '#a9cfdd';
    g.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      const y = ((i * 19 + sea * 0.8) % (H + 30)) - 15;
      const x = ((hash1(i * 4.7) * (W + 120) + Math.sin(t * 0.5 + i) * 24) % (W + 80)) - 40;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 20, y - 2.5, x + 42, y);
      g.stroke();
    }
    g.restore();

    // Moonlight, flat on the water to the north-east.
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, W * 0.78, 36, 120, '#9fc7dd', 0.1);
    for (let i = 0; i < 16; i++) {
      const x = W * 0.78 + Math.sin(i * 2.3 + t * 0.7) * (12 + i * 2.6);
      const y = 14 + i * 4.2;
      g.globalAlpha = 0.12 - i * 0.005;
      g.fillStyle = '#d7ecf6';
      g.fillRect(Math.round(x), Math.round(y), 3 + (i % 3) * 2, 1);
    }
    g.restore();

    // Islands go down both sides of the frame as she goes north.
    const islandFade = 1 - land * 0.92;
    for (let i = 0; i < 7; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const speed = 13 + (i % 3) * 4;
      const y = ((t * speed + i * 83) % (H + 170)) - 85;
      const x = W / 2 + side * (122 + hash1(i * 6.1) * 58);
      const s = 0.75 + hash1(i * 3.7 + 1.2) * 0.55;
      g.save();
      g.globalAlpha = islandFade * (0.7 + hash1(i * 8.9) * 0.3);
      this.drawVoyageIsland(g, x, y, s, i);
      g.restore();
    }

    // The mainland comes down from the top of the frame: a coast, not a horizon.
    if (land > 0.01) {
      const coast = -80 + land * 172;
      g.save();
      g.globalAlpha = clamp(land * 2.6, 0, 0.9);
      g.strokeStyle = 'rgba(185,218,228,0.38)';
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= 16; i++) {
        const x = (i / 16) * W;
        const y = coast + Math.sin(i * 1.7 + 2.1) * 3 + hash1(i * 5.3) * 5;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.restore();

      g.save();
      const lg = g.createLinearGradient(0, 0, 0, Math.max(1, coast));
      lg.addColorStop(0, '#070e12');
      lg.addColorStop(0.7, '#0b1619');
      lg.addColorStop(1, '#12211f');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(W, -10);
      g.lineTo(W, coast);
      for (let i = 16; i >= 0; i--) {
        const x = (i / 16) * W;
        const y = coast + Math.sin(i * 1.7 + 2.1) * 3 + hash1(i * 5.3) * 5;
        g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
      g.globalAlpha = 0.25 * land;
      g.strokeStyle = '#b9d8e2';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= 16; i++) {
        const x = (i / 16) * W;
        const y = coast + 4 + Math.sin(i * 1.7 + 2.1) * 3 + hash1(i * 5.3) * 5;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.restore();

      if (coast > 34) {
        g.save();
        g.globalAlpha = clamp((coast - 34) / 50, 0, 1);
        // forest cover, seen from above
        g.fillStyle = 'rgba(12,26,22,0.8)';
        for (let i = 0; i < 90; i++) {
          const x = 8 + hash1(i * 2.3 + 8.8) * (W - 16);
          const y = 6 + hash1(i * 7.7 + 3.1) * Math.max(4, coast - 18);
          g.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
        // roads and broken sea walls
        g.strokeStyle = 'rgba(86,104,102,0.45)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(W * 0.18, coast - 10);
        g.lineTo(W * 0.42, coast - 10);
        g.moveTo(W * 0.58, coast - 10);
        g.lineTo(W * 0.84, coast - 10);
        g.stroke();
        // roofless halls and towers from directly above
        for (let i = 0; i < 9; i++) {
          const bx = 42 + hash1(i * 3.1 + 7.7) * (W - 84);
          const by = 16 + hash1(i * 6.9 + 2.2) * Math.max(6, coast - 42);
          const bw = 9 + hash1(i * 8.1) * 14;
          const bh = 7 + hash1(i * 2.7 + 5.1) * 10;
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.fillRect(Math.round(bx + 3), Math.round(by + 3), Math.round(bw), Math.round(bh));
          g.fillStyle = '#0b1110';
          g.fillRect(Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh));
          g.strokeStyle = 'rgba(94,110,104,0.35)';
          g.lineWidth = 1;
          g.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(bw) - 1, Math.round(bh) - 1);
          if (hash1(i * 4.3) > 0.4) {
            g.fillStyle = 'rgba(255,178,92,0.55)';
            g.fillRect(Math.round(bx + bw / 2), Math.round(by + bh / 2), 1, 1);
          }
        }
        // the quay she is making for
        g.fillStyle = '#101716';
        g.fillRect(Math.round(W * 0.54), Math.round(coast - 8), 30, 26);
        g.fillStyle = '#1a2320';
        g.fillRect(Math.round(W * 0.54), Math.round(coast - 8), 30, 4);
        g.fillStyle = 'rgba(255,186,104,0.75)';
        g.fillRect(Math.round(W * 0.54) + 4, Math.round(coast + 11), 1, 1);
        g.fillRect(Math.round(W * 0.54) + 25, Math.round(coast + 11), 1, 1);
        g.restore();
      }
    }

    // A ship, not a boat: three masts, a raised stern and a long wake.
    const bob = Math.sin(t * 1.4) * 1.4;
    const sway = Math.sin(t * 0.7) * 2.2;
    const sx = W * 0.45 + land * 22 + sway;
    const sy = H * 0.58 - land * 8 + bob;
    g.save();
    g.translate(Math.round(sx), Math.round(sy));

    // wake first, so the hull sits on top of its own water
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(170,210,224,0.24)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-13, 44);
    g.quadraticCurveTo(-24, 80, -36, 132);
    g.moveTo(13, 44);
    g.quadraticCurveTo(24, 80, 36, 132);
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const k = (t * 0.45 + i / 12) % 1;
      const w = 10 + k * 26;
      g.globalAlpha = (1 - k) * 0.24;
      g.fillStyle = '#d5eaf2';
      g.fillRect(Math.round(-w / 2 + Math.sin(i * 3.3) * 3), Math.round(48 + k * 76), 2, 2);
    }
    g.restore();
    g.rotate(Math.sin(t * 0.9) * 0.015);

    // bow wave
    g.strokeStyle = 'rgba(190,220,230,0.2)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -60);
    g.quadraticCurveTo(-18, -52, -28, -34);
    g.moveTo(0, -60);
    g.quadraticCurveTo(18, -52, 28, -34);
    g.stroke();

    // hull
    g.fillStyle = '#120e0b';
    g.beginPath();
    g.moveTo(0, -62);
    g.quadraticCurveTo(25, -34, 23, 18);
    g.lineTo(16, 48);
    g.quadraticCurveTo(0, 54, -16, 48);
    g.lineTo(-23, 18);
    g.quadraticCurveTo(-25, -34, 0, -62);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(196,164,110,0.32)';
    g.lineWidth = 1.5;
    g.stroke();

    // deck
    g.fillStyle = '#2c2117';
    g.beginPath();
    g.moveTo(0, -54);
    g.quadraticCurveTo(19, -30, 18, 17);
    g.lineTo(12, 42);
    g.quadraticCurveTo(0, 47, -12, 42);
    g.lineTo(-18, 17);
    g.quadraticCurveTo(-19, -30, 0, -54);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(120,88,54,0.35)';
    g.lineWidth = 1;
    for (let y = -44; y <= 38; y += 8) {
      const w = 17 - Math.abs(y - 6) * 0.1;
      g.beginPath();
      g.moveTo(-w, y);
      g.lineTo(w, y);
      g.stroke();
    }

    // bowsprit and rigging
    g.strokeStyle = '#1a140f';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -56);
    g.lineTo(0, -76);
    g.stroke();
    g.strokeStyle = 'rgba(200,206,198,0.14)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -76);
    g.lineTo(-21, -30);
    g.moveTo(0, -76);
    g.lineTo(21, -30);
    g.moveTo(-21, -30);
    g.lineTo(-19, 24);
    g.moveTo(21, -30);
    g.lineTo(19, 24);
    g.moveTo(-19, 24);
    g.lineTo(0, 44);
    g.moveTo(19, 24);
    g.lineTo(0, 44);
    g.stroke();

    // three masts, each with a yard and a sail bellied toward the bow
    const masts = [
      { y: -30, w: 42, sail: 16 },
      { y: -2, w: 46, sail: 18 },
      { y: 24, w: 34, sail: 13 },
    ];
    for (const mast of masts) {
      g.strokeStyle = '#211a13';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-mast.w / 2, mast.y);
      g.lineTo(mast.w / 2, mast.y);
      g.stroke();
      g.fillStyle = 'rgba(230,226,208,0.26)';
      g.beginPath();
      g.moveTo(-mast.w / 2 + 3, mast.y);
      g.quadraticCurveTo(0, mast.y - mast.sail, mast.w / 2 - 3, mast.y);
      g.quadraticCurveTo(0, mast.y + 6, -mast.w / 2 + 3, mast.y);
      g.closePath();
      g.fill();
      g.fillStyle = '#0c0a08';
      g.beginPath();
      g.arc(0, mast.y, 3, 0, TAU);
      g.fill();
    }

    // raised stern, wheel, and the two lanterns
    g.fillStyle = '#1b1611';
    g.fillRect(-11, 34, 22, 13);
    g.fillStyle = '#33261a';
    g.fillRect(-9, 36, 18, 8);
    g.strokeStyle = 'rgba(210,180,120,0.25)';
    g.lineWidth = 1;
    g.strokeRect(-11.5, 34.5, 22, 13);
    g.strokeStyle = 'rgba(200,170,110,0.5)';
    g.beginPath();
    g.arc(0, 30, 3, 0, TAU);
    g.stroke();
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, -18, 38, 10, '#ffb96e', 0.5);
    glow(g, 18, 38, 10, '#ffb96e', 0.5);
    g.restore();
    g.fillStyle = '#ffd39a';
    g.fillRect(-19, 37, 2, 2);
    g.fillRect(17, 37, 2, 2);

    // the girl at the stern, with the two shadows at either rail
    g.fillStyle = '#e6d3bd';
    g.beginPath();
    g.arc(0, 42, 1.8, 0, TAU);
    g.fill();
    g.fillStyle = '#191521';
    g.beginPath();
    g.ellipse(0, 45, 3.4, 3.4, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(230,180,90,0.6)';
    g.fillRect(-3, 43, 1, 3);
    for (const side of [-1, 1]) {
      g.fillStyle = '#0e1218';
      g.beginPath();
      g.ellipse(side * 9, 43, 2.6, 3.2, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(120,150,175,0.45)';
      g.fillRect(side * 9 - 1, 40, 2, 1);
    }
    g.restore();

    const top = g.createLinearGradient(0, 0, 0, 30);
    top.addColorStop(0, 'rgba(3,8,12,0.7)');
    top.addColorStop(1, 'rgba(3,8,12,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, 30);
    drawText(g, 'THE LONG WAY OUT', W / 2, 12, {
      align: 'center', color: 'rgba(190,204,222,0.55)', scale: 1, spacing: 3,
    });

    const lines = [
      [0.8, 'THE SHIP TAKES THE LONG WAY OUT.'],
      [4.4, 'ISLANDS PASS IN THE DARK, ONE AFTER ANOTHER.'],
      [8.0, 'SOME ARE LIT. SOME ARE ONLY SHAPES.'],
      [11.6, 'THE WATER WIDENS UNTIL THERE IS NOTHING LEFT TO PASS.'],
      [15.2, 'ON THE LAST MORNING, THE HORIZON STOPS MOVING.'],
      [18.8, 'A MAINLAND. OLD ENOUGH TO HAVE FORGOTTEN ITS NAME.'],
      [22.4, 'SHE STEPS OFF THE GANGPLANK. THE STORY LETS GO OF HER.'],
    ];
    let line = null;
    let since = 0;
    for (const [at, text] of lines) {
      if (t >= at) { line = text; since = t - at; }
    }
    g.save();
    const band = g.createLinearGradient(0, H - 66, 0, H);
    band.addColorStop(0, 'rgba(3,5,9,0)');
    band.addColorStop(0.55, 'rgba(3,5,9,0.66)');
    band.addColorStop(1, 'rgba(3,5,9,0.9)');
    g.fillStyle = band;
    g.fillRect(0, H - 66, W, 66);
    g.restore();

    if (t < 25.6 && line) {
      g.save();
      g.globalAlpha = clamp(since / 0.9, 0, 1) * 0.96;
      const wrapped = wrapText(line, 420, 1, 1);
      let y = H - 40 - (wrapped.length - 1) * 12;
      for (const part of wrapped) {
        drawText(g, part, W / 2, y, {
          align: 'center', color: '#ddd6cf', scale: 1, spacing: 1, shadow: '#000000',
        });
        y += 13;
      }
      g.restore();
    } else if (t >= 25.6) {
      g.save();
      g.globalAlpha = clamp((t - 25.6) / 1.2, 0, 1);
      drawText(g, 'THE MAINLAND', W / 2, H - 50, {
        align: 'center', color: '#efe6d8', scale: 2, spacing: 3, shadow: '#000000',
      });
      drawText(g, 'THE DESERT REMEMBERS HER', W / 2, H - 30, {
        align: 'center', color: '#d9a36e', scale: 1, spacing: 3, shadow: '#000000',
      });
      const blink = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 1.8));
      g.globalAlpha *= blink;
      drawText(g, 'E  STEP ASHORE', W / 2, H - 14, {
        align: 'center', color: '#9c93a6', scale: 1, spacing: 2,
      });
      g.restore();
    }
  }

  showHeroDown() {
    const battle = this.bossBattle;
    if (!battle || battle.ending) return;
    battle.ending = true;
    this.mode = 'ending';
    this.ending = {
      name: 'THE LAST LIGHT',
      continued: true,
      lines: [
        'HER LEGS GIVE OUT IN THE MIDDLE OF THE ROAD.',
        'THE GHOST SHIELDS CLOSE OVER HER LIKE COLD WATER, AND THE STREET GOES QUIET.',
        'RED AND YELLOW ARE ALREADY GONE — WAITING AT THE NEXT DOOR.',
        'WHAT HAPPENS NEXT HAS NOT BEEN WRITTEN YET.',
      ],
      count: this.found.size,
      powers: this.powers.size,
      t: 0,
    };
    this.bossBattle = null;
    this.fade = 1;
    this.fadeTarget = 0;
    this.audio.play('transition');
    this.audio.applyBiome('city');
  }

  // ---------------------------------------------------------------- the lookout
  // She climbs until the mountain gives out, and the valley shows her what is left of the city.
  beginLookout() {
    this.frozen = true;
    this.blocker = null;
    this.nearby = null;
    this.nearPower = null;
    this.card = null;
    this.note = null;
    this.lookedOut = true;
    this.audio.applyBiome('metal');
    this.audio.play('transition');
    if (!this.cityScene) this.cityScene = buildCityScene();

    // the ledge: a notch in the ridge, with the rock climbing in at both edges
    const FOCUS = W * 0.55;
    const ridge = (x) => {
      const k = Math.min(1, Math.abs(x - FOCUS) / FOCUS);
      return 206 - 58 * Math.pow(k, 2.1) + Math.sin(x * 0.05) * 1.6;
    };
    const lk = { t: 0, ridge, focus: FOCUS };
    this.lookout = lk;

    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    vgrad(g, 0, 0, W, H, [[0, '#03060d'], [0.42, '#0a1524'], [0.78, '#17293c'], [1, '#22384c']], 2);
    for (let i = 0; i < 150; i++) {
      const x = hash1(i * 3.7) * W;
      const y = hash1(i * 9.1) * 118;
      g.fillStyle = `rgba(214,232,255,${0.14 + hash1(i * 5.3) * 0.5})`;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    disc(g, 398, 34, 10, '#dbe6f2');
    disc(g, 394, 31, 7, '#eef5ff');

    // the city, a long way down and a long way off
    const far = this.cityScene.layers[0].canvas;
    const mid = this.cityScene.layers[1].canvas;
    g.save();
    g.globalAlpha = 0.72;
    g.drawImage(far, 0, 122, far.width, 90, 0, 138, W, 52);
    g.restore();
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, W * 0.5, 196, 180, '#ff8a46', 0.1);
    glow(g, W * 0.24, 198, 96, '#ff6a30', 0.07);
    g.restore();
    g.save();
    g.globalAlpha = 0.55;
    g.drawImage(mid, 0, 130, mid.width, 106, 0, 172, W, 40);
    g.restore();
    // fog sitting in the valley, thicker the further down you look
    for (let y = 130; y < 214; y++) {
      const a = 0.04 + Math.sin(((y - 130) / 84) * Math.PI) * 0.2;
      g.fillStyle = `rgba(120,152,190,${a})`;
      g.fillRect(0, y, W, 1);
    }
    g.fillStyle = 'rgba(96,126,164,0.16)';
    g.fillRect(0, 186, W, 12);

    // the ridge she is standing on
    for (let x = 0; x < W; x++) {
      const top = Math.round(ridge(x));
      g.fillStyle = '#05080f';
      g.fillRect(x, top, 1, H - top);
      g.fillStyle = 'rgba(206,228,252,0.62)';
      g.fillRect(x, top, 1, 1);
      g.fillStyle = 'rgba(120,150,186,0.2)';
      g.fillRect(x, top + 1, 1, 2 + Math.round(hash1(x * 2.3) * 3));
      if (hash1(x * 1.7) > 0.74) {
        g.fillStyle = 'rgba(206,228,252,0.16)';
        g.fillRect(x, top + 4 + Math.floor(hash1(x * 2.3) * 10), 1, 1);
      }
    }
    for (let i = 0; i < 300; i++) {
      const x = hash1(i * 4.1) * W;
      const top = ridge(x);
      g.fillStyle = `rgba(226,240,255,${0.07 + hash1(i * 8.3) * 0.24})`;
      g.fillRect(Math.round(x), Math.round(top + 1 + hash1(i * 2.9) * 12), 1, 1);
    }
    lk.vista = c;
    lk.lines = [
      [0.6, 'SHE CLIMBS UNTIL THE AIR THINS AND THE WIND TURNS TO TEETH.'],
      [3.0, 'THEN THE MOUNTAIN GIVES OUT — AND THERE IT IS, FAR BELOW.'],
      [5.8, 'THE CITY. STILL STANDING. NOT THE WAY SHE LEFT IT.'],
      [8.6, 'SOMETHING DOWN THERE IS STILL BURNING.'],
    ];
  }

  updateLookout(dt) {
    const lk = this.lookout;
    lk.t += dt;
    if (lk.t > 1.4 && this.input.consume('interact')) this.endLookout();
    else if (lk.t > 11.6) this.endLookout();
  }

  endLookout() {
    this.lookout = null;
    this.frozen = false;
    this.audio.play('whisper');
    if (this.climbEpilogue) {
      this.climbEpilogue = false;
      this.showPortArrival();
      return;
    }
    this.fade = 0.85;
    this.fadeTarget = 0;
    this.audio.applyBiome(this.level.theme);
  }

  drawLookout(g) {
    const lk = this.lookout;
    const t = lk.t;
    g.drawImage(lk.vista, 0, 0);

    const gx = lk.focus;
    const gy = lk.ridge(gx);
    g.save();
    g.globalCompositeOperation = 'lighter';
    glow(g, gx - 4, gy - 16, 46, '#cfe4ff', 0.1);
    glow(g, gx - 34, gy - 10, 26, '#8fa6c8', 0.07);
    glow(g, gx + 30, gy - 10, 26, '#8fa6c8', 0.07);
    g.restore();
    drawGuardian(g, gx - 32, gy + 6, this.time, 1.1, { scale: 0.74, alpha: 0.72, eye: '#c8dcff', eyeGlow: 0.2 });
    drawGuardian(g, gx + 29, gy + 5, this.time, 3.4, { scale: 0.68, alpha: 0.66, eye: '#c8dcff', eyeGlow: 0.2 });
    g.drawImage(GIRL.idle[0], Math.round(gx) - 6, Math.round(gy) - 19);

    for (let i = 0; i < 80; i++) {
      const sp = 10 + hash1(i * 2.1) * 30;
      const sx = (hash1(i * 5.7) * (W + 60) + t * sp * 0.7) % (W + 60) - 30;
      const sy = (hash1(i * 3.3) * H + t * sp) % H;
      g.fillStyle = `rgba(226,240,255,${0.12 + hash1(i * 7.1) * 0.45})`;
      g.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }

    g.fillStyle = 'rgba(4,7,12,0.7)';
    g.fillRect(0, 232, W, H - 232);
    g.fillStyle = 'rgba(150,180,214,0.2)';
    g.fillRect(0, 232, W, 1);

    let line = null;
    let at = 0;
    for (const [when, text] of lk.lines) {
      if (t >= when) {
        line = text;
        at = when;
      }
    }
    if (line) {
      const a = clamp((t - at) / 0.7, 0, 1) * 0.95;
      g.save();
      g.globalAlpha = a;
      drawText(g, line, W / 2, 241, { align: 'center', color: '#dde5f0', scale: 1, spacing: 1 });
      g.restore();
    }

    drawText(g, 'THE LAST JOURNEY', 10, 9, { color: '#5f6b80', scale: 1, spacing: 2 });
    if (t > 1.4) {
      const blink = 0.35 + 0.5 * Math.abs(Math.sin(t * 2));
      g.save();
      g.globalAlpha = blink;
      drawText(g, this.climbEpilogue ? 'E  GO ON' : 'E  LOOK AWAY', W - 10, 9, { align: 'right', color: '#7d8a9e', scale: 1 });
      g.restore();
    }
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
      mainland: ['#d9a06a', '#b87548', '#f0d3a0'],
      cliffs: ['#7fa06b', '#557a52', '#b7d58a'],
      mountain: ['#dceaf8', '#b6cbe0', '#ffffff'],
      village: ['#5a4a44', '#6d5b52', '#8a786c'],
      city: ['#3a3f52', '#4a5166', '#5c6478'],
      port: ['#3a4450', '#4c5966', '#26303a'],
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
    } else if (theme === 'mainland') {
      if (rnd() < dt * 8) {
        this.spawn({
          type: 'mote', x: camX - 10, y: 90 + rnd() * 150,
          vx: 18 + rnd() * 28, vy: (rnd() - 0.5) * 5,
          color: rnd() < 0.5 ? '#f2c58e' : '#d99862', max: 5 + rnd() * 4,
          alpha: 0.3, size: rnd() < 0.2 ? 2 : 1,
        });
      }
    } else if (theme === 'cliffs') {
      if (rnd() < dt * 4) {
        this.spawn({
          type: 'mote', x: camX + rnd() * W, y: 120 + rnd() * 115,
          vx: 3 + rnd() * 8, vy: -2 - rnd() * 4,
          color: rnd() < 0.5 ? '#c4e0c4' : '#e8f2d8', max: 5 + rnd() * 5,
          alpha: 0.32, size: 1, sway: 3,
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
    } else if (theme === 'port') {
      // cold spray blowing off the water, and the lamp light caught in it
      if (rnd() < dt * 5) {
        this.spawn({
          type: 'mote',
          x: camX + rnd() * W,
          y: 150 + rnd() * 100,
          vx: -8 - rnd() * 16,
          vy: -2 - rnd() * 5,
          color: rnd() < 0.7 ? '#a8c4dc' : '#ffd9a0',
          max: 5 + rnd() * 4,
          alpha: 0.3,
          size: 1,
          sway: 2,
        });
      }
      if (rnd() < dt * 2) {
        this.spawn({
          type: 'firefly',
          x: camX + rnd() * W,
          y: 190 + rnd() * 50,
          vx: 2,
          vy: -3,
          color: '#ffe6b4',
          max: 2.6,
          alpha: 0.5,
          size: 1,
          sway: 1,
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

    if (this.voyage) {
      this.drawVoyage(g);
      this.drawOverlays(g);
      return;
    }

    if (this.mode === 'ending') {
      this.drawEnding(g);
      this.drawOverlays(g);
      return;
    }

    if (this.lookout) {
      this.drawLookout(g);
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
    if (this.combat) this.drawWildsBack(g);
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
    if (this.combat) this.drawWildsFront(g);
    if (this.whale) this.drawWhale(g);
    if (this.level.foreground) {
      const x = Math.round(this.cam.x);
      g.drawImage(this.level.foreground, x, 0, Math.min(W, this.level.width - x), H, 0, 0, Math.min(W, this.level.width - x), H);
    }
  }

  drawWildsBack(g) {
    const c = this.combat;
    const L = this.level;
    if (!c) return;
    const boss = c.boss;

    // The scorpion waits at the far end of the dunes, then fills the screen.
    if (boss && boss.alive && (boss.active || this.player.x > L.boss.triggerX - 300)) {
      const bx = boss.x - this.cam.x;
      if (bx > -150 && bx < W + 150) {
        drawScorpion(g, bx, groundAt(L, boss.x), this.time, {
          scale: 1.08,
          facing: boss.facing,
          flash: boss.flash,
          stomp: boss.stomp,
          sting: boss.stingT > 0 ? 1 : 0,
          claw: boss.clawT > 0 ? 1 : 0,
        });
        if (boss.stingT > 0) {
          const k = clamp(1 - boss.stingT / boss.stingMax, 0, 1);
          const mx = boss.stingX - this.cam.x;
          const my = groundAt(L, boss.stingX) - 2;
          if (mx > -50 && mx < W + 50) {
            g.save();
            g.globalCompositeOperation = 'lighter';
            g.globalAlpha = 0.3 + k * 0.55;
            glow(g, mx, my - 8, 16 + k * 24, '#ff6a3c', 0.55);
            g.strokeStyle = '#ffb07a';
            g.lineWidth = 1;
            g.beginPath();
            g.ellipse(mx, my, 34 - k * 8, 5, 0, 0, TAU);
            g.stroke();
            g.fillStyle = 'rgba(255,176,122,0.55)';
            g.fillRect(Math.round(mx), Math.round(my) - 42, 1, 36);
            g.restore();
          }
        }
        if (boss.clawT > 0) {
          const k = clamp(1 - boss.clawT / boss.clawMax, 0, 1);
          const my = groundAt(L, boss.x) - 2;
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.25 + k * 0.45;
          g.strokeStyle = '#e0a060';
          g.lineWidth = 2;
          g.beginPath();
          g.ellipse(bx - 30, my, 54 + k * 24, 8, 0, 0, TAU);
          g.stroke();
          g.restore();
        }
      }
    }

    for (const dog of c.dogs) {
      if (!dog.alive) continue;
      const sx = dog.x - this.cam.x;
      if (sx < -70 || sx > W + 70) continue;
      drawDog(g, sx, groundAt(L, dog.x), this.time, {
        facing: dog.dir,
        flash: dog.flash,
        moving: dog.moving,
        run: dog.x * 0.01,
      });
    }

    if (c.beamOn) this.drawWildsBeam(g);
  }

  drawWildsFront(g) {
    const c = this.combat;
    if (!c) return;
    for (const shard of c.shards) {
      const sx = shard.x - this.cam.x;
      if (sx < -20 || sx > W + 20) continue;
      g.save();
      g.translate(Math.round(sx), Math.round(shard.y));
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
  }

  drawWildsBeam(g) {
    const c = this.combat;
    if (!c || !c.beamOn) return;
    const L = this.level;
    const p = this.player;
    const dir = c.beamDir || 1;
    const xs = this.guardians.map((gd) => gd.x - this.cam.x + 10);
    const gx = dir > 0 ? Math.min(...xs) : Math.max(...xs);
    const ex = dir > 0 ? W + 30 : -30;
    const x0 = Math.min(gx, ex);
    const width = Math.abs(ex - gx);
    if (width <= 0 || !Number.isFinite(width)) return;
    const beamY = groundAt(L, p.x) - 40;
    const pulse = 0.9 + Math.sin(this.time * 26) * 0.08;

    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.42 * pulse;
    g.fillStyle = '#c9e8ff';
    g.fillRect(x0, beamY - 30, width, 60);
    glow(g, x0 + width * 0.55, beamY, Math.min(170, width * 0.7), '#e8f7ff', 0.58);
    g.globalAlpha = 0.78;
    g.fillStyle = '#eaf7ff';
    g.fillRect(x0, beamY - 18, width, 36);
    g.globalAlpha = 0.96;
    g.fillStyle = '#ffffff';
    g.fillRect(x0, beamY - 9, width, 18);
    g.globalAlpha = 0.86;
    g.fillRect(x0, beamY - 3, width, 6);
    for (const gx2 of xs) {
      glow(g, gx2, beamY, 30, '#ffffff', 0.9);
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(gx2 - 3), Math.round(beamY - 14), 8, 28);
    }
    for (let i = 0; i < 10; i++) {
      const k = (this.time * 2.8 + i / 10) % 1;
      g.globalAlpha = 0.5 + (i % 3) * 0.12;
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(x0 + k * width), Math.round(beamY + Math.sin(this.time * 17 + i * 2.1) * 8), 2, 2);
    }
    g.restore();
  }

  drawWildsUI(g) {
    const c = this.combat;
    if (!c) return;
    const boss = c.boss;
    const bossAlive = boss && boss.active && boss.alive;

    if (bossAlive) {
      g.save();
      g.fillStyle = 'rgba(3,4,10,0.7)';
      g.fillRect(68, 4, W - 136, 38);
      drawText(g, 'THE SCORPION', W / 2, 6, {
        align: 'center', color: '#e8c08c', scale: 1, spacing: 2, shadow: '#000000',
      });
      drawText(g, 'THE OLD KEEPER OF THE DUNES', W / 2, 17, {
        align: 'center', color: '#9c8068', scale: 1, spacing: 1, shadow: '#000000',
      });
      g.fillStyle = 'rgba(150,120,100,0.25)';
      g.fillRect(176, 29, 128, 5);
      g.fillStyle = '#d28a52';
      g.fillRect(176, 29, Math.max(0, Math.round(128 * boss.hp / boss.maxHp)), 5);
      g.fillStyle = 'rgba(255,230,190,0.3)';
      g.fillRect(176, 29, 128, 1);
      g.restore();
    }

    const frac = clamp(c.hp / c.max, 0, 1);
    const col = frac > 0.55 ? '#ffcf8e' : frac > 0.28 ? '#ffb066' : '#ff6a5a';
    g.save();
    drawText(g, 'HER', 10, H - 45, { color: '#e2d4c0', scale: 1 });
    g.fillStyle = 'rgba(8,5,6,0.8)';
    g.fillRect(9, H - 35, 78, 7);
    g.fillStyle = col;
    g.fillRect(10, H - 33, Math.max(0, Math.round(76 * frac)), 3);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(10, H - 33, 76, 1);
    if (c.hurt > 0.02) {
      g.fillStyle = `rgba(255,255,255,${0.45 * c.hurt})`;
      g.fillRect(10, H - 33, 76, 3);
    }
    const hint = bossAlive
      ? 'W JUMP   SHIFT DASH   X SHARDS   C KNIGHTS\' BEAM'
      : c.dogs.some((dog) => dog.alive)
        ? 'X SHARDS   C KNIGHTS\' BEAM   W JUMP'
        : 'THE WAY SOUTH IS OPEN';
    drawText(g, hint, W / 2, H - 16, {
      align: 'center', color: bossAlive ? '#f0d4b0' : '#e2d4c0', scale: 1, spacing: 1, shadow: '#000000',
    });
    g.restore();
  }

  drawWhale(g) {
    const w = this.whale;
    if (!w) return;
    const b = w.bridge;
    const k = clamp(w.t / 2.8, 0, 1);
    const arc = Math.sin(k * Math.PI);
    const x = b.x - 40 + (b.w + 80) * k - this.cam.x;
    const y = 286 - arc * 150;
    const angle = -Math.cos(k * Math.PI) * 0.36;

    // the water it leaves behind at both lips of the cut
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const [sx, side] of [[b.x - 14 - this.cam.x, -1], [b.x + b.w + 14 - this.cam.x, 1]]) {
      const splash = clamp(arc * 1.6, 0, 1);
      if (splash <= 0) continue;
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI * (0.25 + (i / 14) * 0.5);
        const r = 8 + (i % 5) * 5 + splash * 16;
        g.globalAlpha = splash * (0.2 + (i % 4) * 0.06);
        g.fillStyle = i % 3 ? '#b9d9cf' : '#ffffff';
        g.fillRect(Math.round(sx + Math.cos(a) * r * side), Math.round(246 + Math.sin(a) * r), 2, 2);
      }
    }
    g.restore();

    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.rotate(angle);
    g.globalAlpha = 0.96;

    // tail flukes and the long body
    g.fillStyle = '#122229';
    g.beginPath();
    g.moveTo(-38, -2);
    g.quadraticCurveTo(-52, -12, -64, -19);
    g.quadraticCurveTo(-54, -3, -55, 3);
    g.quadraticCurveTo(-54, 9, -64, 20);
    g.quadraticCurveTo(-51, 13, -38, 4);
    g.closePath();
    g.fill();
    g.fillStyle = '#182d34';
    g.beginPath();
    g.ellipse(-4, 0, 47, 15, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#24424a';
    g.beginPath();
    g.ellipse(-2, -2, 42, 11, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#8aa8a7';
    g.beginPath();
    g.ellipse(11, 6, 28, 6, 0, 0, TAU);
    g.fill();
    // head and jaw
    g.fillStyle = '#162b32';
    g.beginPath();
    g.ellipse(39, 0, 23, 13, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#0e1c22';
    g.beginPath();
    g.moveTo(44, 6);
    g.lineTo(60, 3);
    g.lineTo(52, 11);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(174,203,199,0.34)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(30, 8);
    g.lineTo(55, 6);
    g.stroke();
    // eye and the long grooves of the throat
    g.fillStyle = '#d9e6d8';
    g.fillRect(44, -3, 2, 2);
    g.fillStyle = '#071014';
    g.fillRect(45, -3, 1, 1);
    g.strokeStyle = 'rgba(178,206,201,0.2)';
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      g.moveTo(8 + i * 5, 9);
      g.lineTo(26 + i * 5, 8);
    }
    g.stroke();
    // pectoral fin
    g.fillStyle = '#1c363d';
    g.beginPath();
    g.moveTo(8, 8);
    g.lineTo(18, 27);
    g.lineTo(28, 9);
    g.closePath();
    g.fill();
    // barnacles
    g.fillStyle = '#8da39d';
    g.fillRect(-20, -5, 2, 1);
    g.fillRect(-11, -8, 1, 1);
    g.fillRect(6, -12, 2, 1);
    g.restore();

    // droplets falling back into the cut
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const t = clamp((w.t - i * 0.08) / 2.8, 0, 1);
      if (t <= 0 || t >= 1) continue;
      const dx = b.x - 20 + (b.w + 40) * t - this.cam.x;
      const dy = 286 - Math.sin(t * Math.PI) * 150 + 18 + (1 - t) * 8;
      g.globalAlpha = 0.18;
      g.fillStyle = '#c6e0d8';
      g.fillRect(Math.round(dx), Math.round(dy), 1, 1);
    }
    g.restore();
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

    // The knights' beam reaches past the girl toward whoever she is fighting.
    if (battle.laserActive) this.drawGuardianLaser(g);

    // And then, once he is down, the two of them finish it together.
    if (battle.finish) this.drawBrownFinish(g);

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

    // Active opponents: Blue duels the girl first; the heavy one arrives after.
    for (const boss of battle.bosses) {
      if (!boss.alive || boss.fleeing) continue;
      const sx = boss.x - this.cam.x;
      if (sx < -80 || sx > W + 80) continue;
      const isBlue = boss.kind === 'blue';
      if (!isBlue && !battle.brownEngaged) continue;
      drawTeen(g, sx, groundAt(L, boss.x), this.time, {
        color: boss.color,
        style: boss.style,
        scale: boss.scale,
        flare: boss.flash > 0 ? 1.65
          : (isBlue && (boss.lungeT > 0 || boss.storm) ? 1.35
            : isBlue && boss.windupT > 0 ? 1.24
              : !isBlue && boss.slamT > 0 ? 1.32 : 0.92),
        facing: -1,
      });
      if (boss.flash > 0) {
        g.save();
        g.globalAlpha = boss.flash * 0.22;
        g.fillStyle = '#ffffff';
        g.fillRect(Math.round(sx - 10), Math.round(groundAt(L, boss.x) - 48), 20, 46);
        g.restore();
      }
      // The mark he has chosen: it tightens as the strike comes due.
      if (isBlue && boss.windupT > 0) {
        const k = clamp(1 - boss.windupT / boss.windupMax, 0, 1);
        const mx = boss.strikeX - this.cam.x;
        const my = groundAt(L, boss.strikeX) - 2;
        if (mx > -30 && mx < W + 30) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.3 + k * 0.55;
          glow(g, mx, my - 6, 10 + k * 14, '#6fa8ff', 0.55);
          g.strokeStyle = '#b9d7ff';
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(mx, my, 23 - k * 5, 4, 0, 0, TAU);
          g.stroke();
          g.fillStyle = 'rgba(185,215,255,0.5)';
          g.fillRect(Math.round(mx), Math.round(my) - 26, 1, 22);
          g.restore();
        }
      }
      // The storm's marks: a ring tightening on the ground, then the bolt.
      if (isBlue && boss.storm) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.3 + Math.sin(this.time * 14) * 0.12;
        glow(g, sx, groundAt(L, boss.x) - 30, 30, '#9fc8ff', 0.45);
        g.restore();
        for (const mark of boss.storm.marks) {
          const mx = mark.x - this.cam.x;
          const my = groundAt(L, mark.x) - 2;
          if (mx < -40 || mx > W + 40) continue;
          const k = clamp(1 - mark.w / 0.55, 0, 1);
          g.save();
          g.globalCompositeOperation = 'lighter';
          if (k > 0.68) {
            const boltA = (k - 0.68) / 0.32;
            const jag = Math.round((Math.random() - 0.5) * 6);
            g.globalAlpha = boltA * 0.9;
            g.fillStyle = '#dff1ff';
            g.fillRect(Math.round(mx), Math.round(my) - 130, 2, 130);
            g.fillRect(Math.round(mx) + jag, Math.round(my) - 96, 1, 96);
            glow(g, mx, my, 30, '#b9d7ff', 0.75 * boltA);
          } else {
            g.globalAlpha = 0.35 + k * 0.5;
            glow(g, mx, my - 6, 12 + k * 16, '#6fa8ff', 0.5);
            g.strokeStyle = '#b9d7ff';
            g.lineWidth = 1;
            g.beginPath();
            g.ellipse(mx, my, 22 - k * 3, 4, 0, 0, TAU);
            g.stroke();
          }
          g.restore();
        }
      }
      // The heavy one's overhead blow: the ring is where his fist will land.
      if (!isBlue && boss.slamT > 0) {
        const k = clamp(1 - boss.slamT / boss.slamMax, 0, 1);
        const mx = boss.slamX - this.cam.x;
        const my = groundAt(L, boss.slamX) - 2;
        if (mx > -50 && mx < W + 50) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.3 + k * 0.5;
          glow(g, mx, my - 8, 24 + k * 34, '#d6a06a', 0.5);
          g.strokeStyle = '#f0c396';
          g.lineWidth = 2;
          g.beginPath();
          g.ellipse(mx, my, 44 - k * 8, 6, 0, 0, TAU);
          g.stroke();
          g.strokeStyle = 'rgba(240,195,150,0.55)';
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(mx, my, 28 - k * 5, 4, 0, 0, TAU);
          g.stroke();
          g.fillStyle = 'rgba(240,195,150,0.4)';
          g.fillRect(Math.round(mx), Math.round(my) - 58 + k * 20, 1, 36);
          g.restore();
        }
      }
      if (isBlue && boss.lungeT > 0.12 && Math.abs(boss.x - this.player.x) < 48) {
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
        const radius = 18 + pulse * 58;
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

    // The two of them behind her — and, at the very end, either side of him.
    const beamOn = battle.finish ? (battle.finish.fired && !battle.finish.gone) : battle.laserActive;
    for (let i = 1; i >= 0; i--) {
      const gd = this.guardians[i];
      const sx = gd.x - this.cam.x;
      drawGuardian(g, sx, gd.y, this.time, gd.phase, {
        scale: i === 0 ? 1.04 : 0.98,
        alpha: 0.99,
        eye: '#f4f8ff',
        lean: beamOn ? 9 : (battle.brownEngaged ? 5 : 0),
        eyeGlow: beamOn ? 0.9 : 0.34,
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
    const target = battle.bosses.find((boss) => boss.alive && !boss.fleeing
      && (battle.brownEngaged ? boss.kind === 'brown' : boss.kind === 'blue'));
    const endWorld = target ? target.x + 34 : battle.playerX + 220;
    const ex = Math.min(W + 20, endWorld - this.cam.x);
    const beamY = groundAt(L, this.player.x) - 40;
    const width = Math.max(0, ex - sx);
    if (width <= 0) return;
    const pulse = 0.9 + Math.sin(this.time * 26) * 0.08;

    g.save();
    g.globalCompositeOperation = 'lighter';
    // Wide atmospheric bloom, broad white body, then a sharp central core.
    g.globalAlpha = 0.46 * pulse;
    g.fillStyle = '#c9e8ff';
    g.fillRect(sx, beamY - 32, width, 64);
    glow(g, sx + width * 0.55, beamY, Math.min(170, width * 0.7), '#d9f0ff', 0.62);
    g.globalAlpha = 0.78;
    g.fillStyle = '#eaf7ff';
    g.fillRect(sx, beamY - 20, width, 40);
    g.globalAlpha = 0.96;
    g.fillStyle = '#ffffff';
    g.fillRect(sx, beamY - 10, width, 20);
    g.globalAlpha = 0.86;
    g.fillStyle = '#ffffff';
    g.fillRect(sx, beamY - 3, width, 6);
    if (target) {
      const tx = target.x - this.cam.x;
      if (tx > sx) glow(g, tx, beamY, 36, '#ffffff', 0.6);
    }
    // Two bright mouths make it clear that both knights are powering it.
    for (const gx of battle.guardianXs) {
      const x = gx - this.cam.x + 10;
      glow(g, x, beamY, 32, '#ffffff', 0.98);
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(x - 3), Math.round(beamY - 16), 9, 32);
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
      forest: '#9fe4dc', desert: '#ffe8c8', mainland: '#ffd2a0', cliffs: '#b7e0bf',
      mountain: '#cfe4ff', village: '#ff9a5a', city: '#9fc8ff', port: '#ffd9a0',
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
    if (this.combat) this.drawWildsUI(g);

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
    const brownBoss = battle.bosses.find((boss) => boss.kind === 'brown');
    const blueAlive = blueBoss && blueBoss.alive;
    const brownAlive = brownBoss && brownBoss.alive;
    const heading = blueAlive
      ? (blueBoss.storm ? 'THE STORM' : 'THE DUEL')
      : brownAlive ? 'THE HEAVY ONE' : 'THE LAST LIGHT';
    drawText(g, heading, W / 2, 7, {
      align: 'center', color: '#e9edf6', scale: 1, spacing: 2, shadow: '#000000',
    });

    // One opponent at a time: only the one she is actually fighting gets a bar.
    const entries = blueAlive
      ? [{ kind: 'blue', label: blueBoss.storm ? 'BLUE  /  STORM' : 'BLUE  /  DUEL', x: 176, w: 128 }]
      : [{ kind: 'brown', label: 'BROWN  /  HEAVY', x: 176, w: 128 }];
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

    // her bar
    const hero = battle.hero;
    const heroFrac = clamp(hero.hp / hero.max, 0, 1);
    const heroCol = heroFrac > 0.55 ? '#8fd0ff' : heroFrac > 0.28 ? '#ffd166' : '#ff6a6a';
    drawText(g, 'HER', 12, H - 47, { color: '#cfc6e4', scale: 1 });
    g.fillStyle = 'rgba(4,5,10,0.78)';
    g.fillRect(11, H - 38, 78, 7);
    g.fillStyle = heroCol;
    g.fillRect(12, H - 36, Math.max(0, Math.round(76 * heroFrac)), 3);
    g.fillStyle = 'rgba(232,242,255,0.26)';
    g.fillRect(12, H - 36, 76, 1);
    if (hero.hurt > 0.02) {
      g.fillStyle = `rgba(255,255,255,${0.5 * hero.hurt})`;
      g.fillRect(12, H - 36, 76, 3);
    }
    if (battle.escapeBannerT > 0) {
      const a = Math.min(1, battle.escapeBannerT * 1.5);
      drawText(g, 'RED + YELLOW FLED', W / 2, 54, {
        align: 'center', color: `rgba(225,220,235,${a})`, scale: 1, spacing: 1, shadow: '#000000',
      });
    }
    if (battle.finish) {
      const f = battle.finish;
      const line = f.gone
        ? 'HE IS GONE. NOTHING LEFT OF HIM BUT THE LIGHT.'
        : f.fired
          ? 'BOTH OF THEM, AT ONCE, INTO THE SAME POINT.'
          : 'ONE OF THEM EITHER SIDE. THEY LOOK AT HIM.';
      drawText(g, line, W / 2, H - 18, {
        align: 'center', color: f.fired ? '#ffffff' : '#c8d4e6', scale: 1, spacing: 1, shadow: '#000000',
      });
    } else {
      const laserText = battle.laserActive
        ? 'GUARDIANS: HEAVY BEAM'
        : 'HOLD C  KNIGHTS\' BEAM';
      const storming = blueAlive && blueBoss.storm;
      const marked = blueAlive && blueBoss.windupT > 0;
      const bracing = brownAlive && brownBoss.slamT > 0;
      const hint = storming
        ? 'KEEP MOVING - OUT OF THE MARKS'
        : marked ? 'JUMP OR STEP OUT OF THE MARK'
          : bracing ? 'JUMP OR CLEAR THE MARK'
            : 'W JUMP   SHIFT DASH   X SHARDS   C BEAM';
      drawText(g, hint, W / 2, H - 25, {
        align: 'center',
        color: (storming || marked) ? '#b9d7ff' : bracing ? '#f0c396' : '#f2f0f7',
        scale: 1, spacing: 1, shadow: '#000000',
      });
      drawText(g, laserText, W / 2, H - 13, {
        align: 'center', color: battle.laserActive ? '#ffffff' : '#b8c7da', scale: 1, spacing: 1, shadow: '#000000',
      });
    }
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
    if (this.combat && this.combat.hurt > 0) {
      g.fillStyle = `rgba(255,48,32,${this.combat.hurt * 0.16})`;
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
        drawText(g, this.ending.prompt || 'PRESS R TO WALK AGAIN', W / 2, 262, { align: 'center', color: '#d8d0e2', scale: 1, spacing: 2 });
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
