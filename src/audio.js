// Procedural ambient score and environmental sound effects (WebAudio, no assets).

import { clamp } from './util.js';

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

const BIOMES = {
  forest: {
    root: 45,
    chords: [
      [45, 52, 57],
      [41, 48, 53],
      [48, 55, 60],
      [43, 50, 55],
    ],
    scale: [0, 3, 5, 7, 10],
    chordDur: 11,
    padGain: 0.075,
    bellGain: 0.085,
    bellEvery: [2.6, 5.4],
    wind: 0.016,
    windFreq: 520,
    windQ: 0.7,
    bright: 1100,
    music: 0.85,
  },
  desert: {
    root: 41,
    chords: [
      [41, 48, 55],
      [38, 45, 50],
      [43, 50, 57],
      [36, 43, 48],
    ],
    scale: [0, 3, 5, 7, 10],
    chordDur: 13,
    padGain: 0.07,
    bellGain: 0.07,
    bellEvery: [3.4, 6.8],
    wind: 0.03,
    windFreq: 300,
    windQ: 0.5,
    bright: 700,
    music: 0.8,
  },
  mainland: {
    root: 40,
    chords: [
      [40, 47, 52],
      [36, 43, 48],
      [43, 50, 55],
      [38, 45, 50],
    ],
    scale: [0, 3, 5, 7, 10],
    chordDur: 14,
    padGain: 0.075,
    bellGain: 0.055,
    bellEvery: [4.6, 9.2],
    wind: 0.042,
    windFreq: 340,
    windQ: 0.6,
    bright: 640,
    music: 0.82,
  },
  cliffs: {
    root: 45,
    chords: [
      [45, 52, 57],
      [41, 48, 53],
      [48, 55, 60],
      [43, 50, 55],
    ],
    scale: [0, 2, 5, 7, 10],
    chordDur: 15,
    padGain: 0.075,
    bellGain: 0.06,
    bellEvery: [3.8, 7.6],
    wind: 0.05,
    windFreq: 860,
    windQ: 1.1,
    bright: 1100,
    music: 0.82,
  },
  mountain: {
    root: 42,
    chords: [
      [42, 49, 54],
      [47, 54, 59],
      [45, 52, 57],
      [40, 47, 52],
    ],
    scale: [0, 2, 3, 7, 10],
    chordDur: 12,
    padGain: 0.08,
    bellGain: 0.08,
    bellEvery: [2.8, 5.6],
    wind: 0.055,
    windFreq: 780,
    windQ: 1.4,
    bright: 900,
    music: 0.85,
  },
  city: {
    root: 40,
    chords: [
      [40, 47, 52],
      [45, 52, 57],
      [43, 50, 55],
      [38, 45, 50],
    ],
    scale: [0, 3, 5, 7, 10],
    chordDur: 12,
    padGain: 0.075,
    bellGain: 0.068,
    bellEvery: [2.4, 4.8],
    wind: 0.02,
    windFreq: 420,
    windQ: 0.8,
    bright: 820,
    music: 0.85,
  },
  // Cold water, ropes, and a ship waiting at the end of the road.
  port: {
    root: 38,
    chords: [
      [38, 45, 50],
      [41, 48, 53],
      [36, 43, 48],
      [43, 50, 57],
    ],
    scale: [0, 3, 5, 7, 10],
    chordDur: 14,
    padGain: 0.085,
    bellGain: 0.055,
    bellEvery: [4.2, 8.4],
    wind: 0.045,
    windFreq: 620,
    windQ: 0.9,
    bright: 760,
    music: 0.8,
  },
  // Heavy metal, and only ever heard while she looks down at the city.
  metal: {
    root: 38,
    chords: [
      [40, 47, 52],
      [40, 47, 52],
      [43, 50, 55],
      [38, 45, 50],
    ],
    scale: [0, 3, 5, 7, 10],
    chordDur: 3.2,
    padGain: 0,
    bellGain: 0,
    bellEvery: [90, 100],
    wind: 0.012,
    windFreq: 260,
    windQ: 0.6,
    bright: 2600,
    music: 1,
    riff: true,
    bpm: 168,
    riffGain: 0.1,
  },
  village: {
    root: 43,
    chords: [
      [43, 50, 55],
      [41, 48, 53],
      [36, 43, 48],
      [38, 45, 50],
    ],
    scale: [0, 3, 5, 6, 10],
    chordDur: 14,
    padGain: 0.085,
    bellGain: 0.075,
    bellEvery: [3.0, 6.0],
    wind: 0.04,
    windFreq: 380,
    windQ: 0.9,
    bright: 620,
    music: 0.9,
  },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.muted = false;
    this.cfg = BIOMES.forest;
    this.biome = 'forest';
    this.chordIndex = 0;
    this.nextChord = 0;
    this.nextBell = 0;
    this.riffStep = 0;
    this.lastPlay = Object.create(null);
  }

  async start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (e) {
          /* ignore */
        }
      }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try {
      ctx = new AC();
    } catch (e) {
      return;
    }
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.72;

    // A gentle master compressor and rumble filter keep stacked effects from
    // turning into clipping noise when several attacks land at once.
    this.clean = ctx.createBiquadFilter();
    this.clean.type = 'highpass';
    this.clean.frequency.value = 28;
    this.clean.Q.value = 0.7;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 3.5;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.22;
    this.master.connect(this.clean);
    this.clean.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(3.4, 2.6);
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 0.38;
    this.reverb.connect(this.revGain);
    this.revGain.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0.78;
    this.music.connect(this.master);
    this.musicRev = ctx.createGain();
    this.musicRev.gain.value = 0.3;
    this.music.connect(this.musicRev);
    this.musicRev.connect(this.reverb);

    this.fx = ctx.createGain();
    this.fx.gain.value = 0.78;
    this.fx.connect(this.master);
    this.fxRev = ctx.createGain();
    this.fxRev.gain.value = 0.16;
    this.fx.connect(this.fxRev);
    this.fxRev.connect(this.reverb);

    this.delay = ctx.createDelay(1.2);
    this.delay.delayTime.value = 0.44;
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.33;
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.reverb);
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.9;
    this.delaySend.connect(this.delay);

    this.noise = this.noiseBuffer(2.4);

    this.wind = ctx.createBufferSource();
    this.wind.buffer = this.noise;
    this.wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 520;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.wind.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain);
    lfoGain.connect(this.windFilter.frequency);
    lfo.start();

    this.nextChord = ctx.currentTime + 0.3;
    this.nextBell = ctx.currentTime + 3.2;
    this.started = true;
    this.applyBiome(this.biome, true);
  }

  makeIR(dur, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.035;
      data[i] = last * 2.1 + white * 0.07;
    }
    // Remove DC and normalise so the shared noise source never clips.
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) sum += data[i];
    const mean = sum / len;
    for (let i = 0; i < len; i++) {
      data[i] -= mean;
      peak = Math.max(peak, Math.abs(data[i]));
    }
    const norm = peak > 0 ? 0.82 / peak : 1;
    for (let i = 0; i < len; i++) data[i] *= norm;
    // Crossfade the loop seam so wind and noise beds do not tick.
    const fade = Math.min(2048, Math.floor(len * 0.1));
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[len - fade + i] = data[len - fade + i] * (1 - k) + data[i] * k;
    }
    return buf;
  }

  applyBiome(name, instant = false) {
    this.biome = name;
    this.cfg = BIOMES[name] || BIOMES.forest;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = instant ? 0.01 : 1.6;
    const c = this.cfg;
    this.windGain.gain.setTargetAtTime(c.wind, t, k);
    this.windFilter.frequency.setTargetAtTime(c.windFreq, t, k);
    this.windFilter.Q.setTargetAtTime(c.windQ, t, k);
    this.music.gain.setTargetAtTime(c.music, t, k);
    this.nextChord = Math.min(this.nextChord, t + 0.2);
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.72, this.ctx.currentTime, 0.15);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ---- scheduling -------------------------------------------------------
  update() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.cfg.riff) {
      // metal keeps its own clock: eighth-note chugs, no pads, no bells
      const stepDur = 60 / this.cfg.bpm / 2;
      let guard = 0;
      while (this.nextChord < now + 0.4 && guard++ < 6) {
        this.metalStep(this.nextChord);
        this.nextChord += stepDur;
      }
      return;
    }
    let guard = 0;
    while (this.nextChord < now + 0.7 && guard++ < 4) {
      this.scheduleChord(this.nextChord);
      this.nextChord += this.cfg.chordDur;
    }
    guard = 0;
    while (this.nextBell < now + 0.5 && guard++ < 4) {
      this.scheduleBell(this.nextBell);
      const [lo, hi] = this.cfg.bellEvery;
      this.nextBell += lo + Math.random() * (hi - lo);
    }
  }

  scheduleChord(time) {
    const ctx = this.ctx;
    const c = this.cfg;
    const chord = c.chords[this.chordIndex % c.chords.length];
    this.chordIndex++;
    const dur = c.chordDur + 1.5;
    const inversion = Math.random() < 0.4 ? 1 : 0;
    chord.forEach((m, i) => {
      const freq = midi(m + (i < inversion ? 12 : 0));
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = freq;
      o.detune.value = (Math.random() * 2 - 1) * 9;
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = c.bright * (i === 0 ? 0.75 : 1);
      filt.Q.value = 0.4;
      const peak = c.padGain / (1 + i * 0.45);
      o.connect(filt);
      filt.connect(g);
      g.connect(this.music);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(peak, time + 2.6);
      g.gain.setValueAtTime(peak, time + dur - 3);
      g.gain.linearRampToValueAtTime(0.0001, time + dur);
      o.start(time);
      o.stop(time + dur + 0.1);
    });
    // low root, felt more than heard
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = midi(chord[0] - 12);
    const sg = ctx.createGain();
    sub.connect(sg);
    sg.connect(this.music);
    sg.gain.setValueAtTime(0.0001, time);
    sg.gain.linearRampToValueAtTime(c.padGain * 0.5, time + 3);
    sg.gain.linearRampToValueAtTime(0.0001, time + dur);
    sub.start(time);
    sub.stop(time + dur + 0.1);
  }

  scheduleBell(time) {
    const c = this.cfg;
    const octave = Math.random() < 0.35 ? 36 : 24;
    const note = c.chords[0][0] + octave + c.scale[Math.floor(Math.random() * c.scale.length)];
    this.bell(midi(note), time, 0.9 + Math.random() * 0.6, c.bellGain, true);
  }

  bell(freq, time, dur, gain, echo) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2.005;
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.fx);
    if (echo) g.connect(this.delaySend);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.start(time);
    o2.start(time);
    o.stop(time + dur + 0.05);
    o2.stop(time + dur + 0.05);
  }

  // ---- sound effects ----------------------------------------------------
  play(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const last = this.lastPlay[name] || 0;
    if (t - last < 0.035) return;
    this.lastPlay[name] = t;
    switch (name) {
      case 'step':
        this.step(t);
        break;
      case 'jump':
        this.sweep(t, 260, 420, 0.18, 0.035, 'sine');
        break;
      case 'memory':
        this.memoryChime(t);
        break;
      case 'transition':
        this.sweep(t, 120, 46, 2.0, 0.06, 'sine');
        this.swell(t, 1.6, 0.05);
        break;
      case 'whisper':
        this.swell(t, 0.9, 0.028);
        break;
      case 'power':
        this.memoryChime(t);
        this.sweep(t, 180, 620, 0.9, 0.045, 'triangle');
        break;
      case 'blast':
        this.sweep(t, 640, 90, 0.34, 0.05, 'sawtooth');
        this.noiseHit(t, 900, 0.2, 0.018, 1.2, 'lowpass');
        break;
      case 'blueWindup':
        this.blueWindup(t);
        break;
      case 'blueCharge':
        this.blueCharge(t);
        break;
      case 'blueShard':
        this.blueShard(t);
        break;
      case 'blueSlash':
        this.blueSlash(t);
        break;
      case 'maceUp':
        this.maceUp(t);
        break;
      case 'maceSlam':
        this.maceSlam(t);
        break;
      case 'dogBite':
        this.dogBite(t);
        break;
      case 'spiderHiss':
        this.spiderHiss(t);
        break;
      case 'spiderBite':
        this.spiderBite(t);
        break;
      case 'guardianBeam':
        this.guardianBeam(t);
        break;
      case 'scorpionClaw':
        this.scorpionClaw(t);
        break;
      case 'scorpionSting':
        this.scorpionSting(t);
        break;
      case 'hurt':
        this.heroHurt(t);
        break;
      case 'shardCast':
        this.shardCast(t);
        break;
      case 'whale':
        this.sweep(t, 64, 148, 2.8, 0.055, 'sine');
        this.sweep(t + 0.25, 150, 72, 2.3, 0.03, 'triangle');
        this.swell(t, 2.8, 0.026);
        break;
      case 'ending':
        this.endingTone(t);
        break;
      default:
        break;
    }
  }

  // ---- the riff ---------------------------------------------------------
  metalStep(time) {
    const c = this.cfg;
    const step = this.riffStep % 8;
    const bar = Math.floor(this.riffStep / 8) % c.chords.length;
    this.riffStep++;
    // a hole on the last eighth, so every bar lands hard again
    if (step === 7) return;
    const chord = c.chords[bar];
    const push = [0, 0, 0, 0, 3, 0, 6, 0][step];
    const low = midi(chord[0] + push - 12);
    this.chug(time, low, 0.085, c.riffGain);
    // a muted gallop between the eighths, and a fifth stacked above the root
    this.chug(time + 0.075, low, 0.05, c.riffGain * 0.68);
    this.chug(time, midi(chord[0] + push - 5), 0.08, c.riffGain * 0.4);
    if (step === 0 || step === 3 || step === 5) this.kick(time, 0.19);
    if (step === 2 || step === 6) this.snare(time, 0.12);
    this.hat(time, step % 2 ? 0.014 : 0.024);
    if (step === 0) {
      this.crash(time, 0.055);
      this.lead(time + 0.02, midi(chord[2] + 12 + (bar === 2 ? 3 : 0)), 0.055);
    }
    if (step === 4) this.lead(time + 0.01, midi(chord[1] + 24), 0.038);
  }

  chug(time, freq, dur, gain) {
    const ctx = this.ctx;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 4.4);
    }
    shaper.curve = curve;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(2400, time);
    filt.frequency.exponentialRampToValueAtTime(720, time + dur);
    filt.Q.value = 0.9;
    const g = ctx.createGain();
    shaper.connect(filt);
    filt.connect(g);
    g.connect(this.music);
    const voices = [['sawtooth', 1, -8], ['sawtooth', 1, 8], ['square', 0.5, 0]];
    for (const [type, mult, det] of voices) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      o.detune.value = det;
      o.connect(shaper);
      o.start(time);
      o.stop(time + dur + 0.03);
    }
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  }

  kick(time, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(132, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const g = ctx.createGain();
    o.connect(g);
    g.connect(this.music);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.17);
    o.start(time);
    o.stop(time + 0.2);
  }

  crash(time, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4200;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.music);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);
    src.start(time);
    src.stop(time + 1.0);
  }

  snare(time, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.6;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.music);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
    src.start(time);
    src.stop(time + 0.2);
  }

  hat(time, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 3.2;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6400;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.music);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.start(time);
    src.stop(time + 0.08);
  }

  lead(time, freq, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq * 1.02, time);
    o.frequency.exponentialRampToValueAtTime(freq * 0.94, time + 0.9);
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = freq * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3200;
    const g = ctx.createGain();
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.music);
    g.connect(this.delaySend);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);
    o.start(time);
    o2.start(time);
    o.stop(time + 0.95);
    o2.stop(time + 0.95);
  }

  noiseHit(t, freq, dur, gain, q = 1, type = 'bandpass') {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.fx);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t);
    src.stop(t + dur + 0.04);
  }

  blueWindup(t) {
    this.sweep(t, 240, 620, 0.44, 0.024, 'sine');
    this.sweep(t, 120, 300, 0.44, 0.014, 'triangle');
    this.noiseHit(t, 2200, 0.32, 0.009, 2.4);
  }

  blueCharge(t) {
    this.sweep(t, 360, 980, 0.48, 0.027, 'sine');
    this.sweep(t, 180, 490, 0.46, 0.013, 'triangle');
    this.noiseHit(t, 2800, 0.38, 0.01, 3);
    this.bell(midi(88), t + 0.06, 0.55, 0.018, true);
  }

  blueShard(t) {
    this.sweep(t, 1320, 540, 0.22, 0.024, 'triangle');
    this.noiseHit(t, 3200, 0.16, 0.016, 2.8, 'highpass');
  }

  blueSlash(t) {
    this.noiseHit(t, 1050, 0.16, 0.022, 1.4);
    this.sweep(t, 520, 190, 0.15, 0.016, 'sawtooth');
  }

  maceUp(t) {
    this.noiseHit(t, 300, 0.5, 0.021, 0.7);
    this.sweep(t, 92, 138, 0.45, 0.016, 'sine');
  }

  maceSlam(t) {
    this.sweep(t, 150, 42, 0.4, 0.075, 'sine');
    this.noiseHit(t, 340, 0.3, 0.045, 0.8, 'lowpass');
    this.noiseHit(t, 1200, 0.12, 0.014, 1.2);
  }

  dogBite(t) {
    this.sweep(t, 220, 90, 0.12, 0.03, 'sawtooth');
    this.noiseHit(t, 900, 0.09, 0.016, 1.8);
  }

  spiderHiss(t) {
    this.noiseHit(t, 760, 0.28, 0.011, 0.8);
    this.sweep(t, 280, 520, 0.2, 0.012, 'triangle');
  }

  spiderBite(t) {
    this.noiseHit(t, 1500, 0.07, 0.016, 2.2);
    this.sweep(t, 340, 120, 0.12, 0.022, 'square');
  }

  guardianBeam(t) {
    this.sweep(t, 180, 820, 0.24, 0.038, 'sawtooth');
    this.sweep(t, 960, 260, 0.2, 0.022, 'triangle');
    this.noiseHit(t, 2800, 0.15, 0.018, 1.8);
  }

  scorpionClaw(t) {
    this.noiseHit(t, 1350, 0.1, 0.022, 2);
    this.sweep(t, 170, 80, 0.16, 0.024, 'square');
  }

  scorpionSting(t) {
    this.sweep(t, 760, 180, 0.22, 0.026, 'sawtooth');
    this.noiseHit(t, 2400, 0.18, 0.018, 2.4);
  }

  heroHurt(t) {
    this.sweep(t, 120, 55, 0.26, 0.052, 'sine');
    this.noiseHit(t, 320, 0.16, 0.02, 0.9, 'lowpass');
  }

  shardCast(t) {
    this.sweep(t, 580, 1060, 0.16, 0.02, 'triangle');
    this.noiseHit(t, 2600, 0.1, 0.01, 2);
  }

  step(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 380 + Math.random() * 260;
    f.Q.value = 1.05;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.fx);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.024, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.start(t);
    src.stop(t + 0.2);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(92, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
    const thud = ctx.createGain();
    o.connect(thud);
    thud.connect(this.fx);
    thud.gain.setValueAtTime(0.0001, t);
    thud.gain.linearRampToValueAtTime(0.012, t + 0.006);
    thud.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.start(t);
    o.stop(t + 0.12);
  }

  sweep(t, f0, f1, dur, gain, type) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    o.connect(g);
    g.connect(this.fx);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  swell(t, dur, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(1400, t + dur * 0.7);
    f.frequency.linearRampToValueAtTime(420, t + dur);
    f.Q.value = 0.9;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.fx);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  memoryChime(t) {
    const root = this.cfg.root + 24;
    const notes = [0, 7, 12, 19];
    notes.forEach((n, i) => {
      this.bell(midi(root + n), t + i * 0.11, 2.6, 0.1, true);
    });
    this.swell(t, 1.8, 0.03);
  }

  endingTone(t) {
    // The last chord is a low, distorted power chord under the riff, not a bell.
    const root = this.cfg.root;
    [0, 7, 12].forEach((n, i) => {
      this.chug(t + i * 0.025, midi(root + n), 2.2, 0.1 - i * 0.015);
    });
    this.crash(t, 0.06);
    this.lead(t + 0.1, midi(root + 31), 0.07);
  }
}
