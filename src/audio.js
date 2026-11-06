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
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(3.4, 2.6);
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 0.62;
    this.reverb.connect(this.revGain);
    this.revGain.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0.85;
    this.music.connect(this.master);
    this.music.connect(this.reverb);

    this.fx = ctx.createGain();
    this.fx.gain.value = 0.95;
    this.fx.connect(this.master);
    this.fx.connect(this.reverb);

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
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2 + white * 0.15;
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
    this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.15);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ---- scheduling -------------------------------------------------------
  update() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
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
        break;
      case 'ending':
        this.endingTone(t);
        break;
      default:
        break;
    }
  }

  step(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 380 + Math.random() * 260;
    f.Q.value = 1.1;
    const g = ctx.createGain();
    src.connect(f);
    f.connect(g);
    g.connect(this.fx);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.start(t);
    src.stop(t + 0.2);
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
    const root = this.cfg.root;
    [0, 7, 12, 16, 19].forEach((n, i) => {
      this.bell(midi(root + 12 + n), t + i * 0.22, 4.5, 0.085, true);
    });
  }
}
