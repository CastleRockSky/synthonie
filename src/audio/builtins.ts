// Built-in sounds, generated with code at startup so the app is playable with no files.
// Each generator renders a short clip in an OfflineAudioContext. Adding a sound means
// writing a small generator function and adding one entry to BUILTINS at the bottom.

import type { SoundCategory } from '../model/types';
import { crossfadeLoop, normalizeChannels } from './dsp';
import { audioBufferChannels, channelsToAudioBuffer } from './wav';

export interface BuiltinDef {
  id: string;
  name: string;
  icon: string;
  category: SoundCategory;
  /** True for clips designed to loop forever (ambience). */
  loop: boolean;
  make: (sampleRate: number) => Promise<AudioBuffer>;
}

type Ctx = OfflineAudioContext;
type NoiseColor = 'white' | 'pink' | 'brown';

const rnd = (min: number, max: number) => min + Math.random() * (max - min);

function offline(seconds: number, sampleRate: number): Ctx {
  return new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, color: NoiseColor): AudioBuffer {
  const len = Math.ceil(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'white') {
        d[i] = w;
      } else if (color === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        // Paul Kellet's pink noise approximation
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
  }
  return buf;
}

function noise(ctx: Ctx, seconds: number, color: NoiseColor = 'white'): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds, color);
  return src;
}

function filter(ctx: Ctx, type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function osc(ctx: Ctx, type: OscillatorType, freq: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  return o;
}

/** A gain node following an envelope of [time, value] points with exponential ramps. */
function env(ctx: Ctx, points: [number, number][]): GainNode {
  const g = ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(Math.max(points[0][1], 0.0001), points[0][0]);
  for (let i = 1; i < points.length; i++) p.exponentialRampToValueAtTime(Math.max(points[i][1], 0.0001), points[i][0]);
  return g;
}

/** Render, optionally fold the tail into the head so it loops, then normalise. */
async function finish(ctx: Ctx, loopFadeSeconds = 0): Promise<AudioBuffer> {
  const rendered = await ctx.startRendering();
  let chans = audioBufferChannels(rendered);
  if (loopFadeSeconds > 0) chans = crossfadeLoop(chans, loopFadeSeconds * rendered.sampleRate, true);
  normalizeChannels(chans, 0.85);
  return channelsToAudioBuffer(chans, rendered.sampleRate);
}

// ---------------------------------------------------------------- ambience loops

async function wind(sr: number): Promise<AudioBuffer> {
  const secs = 12;
  const ctx = offline(secs, sr);
  const n = noise(ctx, secs, 'pink');
  const lp = filter(ctx, 'lowpass', 250, 2);
  const g = ctx.createGain();
  lp.frequency.setValueAtTime(250, 0);
  g.gain.setValueAtTime(0.5, 0);
  for (let t = 0; t < secs; ) {
    t += rnd(0.8, 2.4);
    const f = rnd(150, 850);
    lp.frequency.linearRampToValueAtTime(f, t);
    g.gain.linearRampToValueAtTime(0.3 + (f / 850) * 0.7, t);
  }
  n.connect(lp).connect(g).connect(ctx.destination);
  n.start(0);
  return finish(ctx, 2);
}

async function rain(sr: number): Promise<AudioBuffer> {
  const secs = 8;
  const ctx = offline(secs, sr);
  const n = noise(ctx, secs, 'white');
  const bp = filter(ctx, 'bandpass', 2200, 0.6);
  const g = ctx.createGain();
  g.gain.value = 0.5;
  n.connect(bp).connect(g).connect(ctx.destination);
  n.start(0);
  for (let k = 0; k < secs * 25; k++) {
    const t = rnd(0, secs - 0.06);
    const f = rnd(1500, 5500);
    const o = osc(ctx, 'sine', f);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.03);
    const e = env(ctx, [[t, 0], [t + 0.002, rnd(0.1, 0.3)], [t + 0.04, 0]]);
    o.connect(e).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.05);
  }
  return finish(ctx, 1);
}

async function fire(sr: number): Promise<AudioBuffer> {
  const secs = 8;
  const ctx = offline(secs, sr);
  const n = noise(ctx, secs, 'brown');
  const lp = filter(ctx, 'lowpass', 350, 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, 0);
  for (let t = 0; t < secs; ) {
    t += rnd(0.3, 0.9);
    g.gain.linearRampToValueAtTime(rnd(0.3, 0.7), t);
  }
  n.connect(lp).connect(g).connect(ctx.destination);
  n.start(0);
  for (let k = 0; k < secs * 14; k++) {
    const t = rnd(0, secs - 0.08);
    const b = noise(ctx, 0.08, 'white');
    const hp = filter(ctx, 'highpass', rnd(1500, 4000), 1);
    const e = env(ctx, [[t, 0], [t + 0.002, rnd(0.2, 0.7)], [t + rnd(0.015, 0.06), 0]]);
    b.connect(hp).connect(e).connect(ctx.destination);
    b.start(t);
  }
  return finish(ctx, 1);
}

async function stream(sr: number): Promise<AudioBuffer> {
  const secs = 8;
  const ctx = offline(secs, sr);
  const n = noise(ctx, secs, 'white');
  const bands: [number, number, number, number, number][] = [
    // centre, Q, gain, lfo rate, lfo depth
    [900, 1, 0.5, 0.25, 300],
    [3000, 0.8, 0.25, 0.4, 1000],
  ];
  for (const [centre, q, gain, rate, depth] of bands) {
    const bp = filter(ctx, 'bandpass', centre, q);
    const g = ctx.createGain();
    g.gain.value = gain;
    const lfo = osc(ctx, 'sine', rate);
    const lg = ctx.createGain();
    lg.gain.value = depth;
    lfo.connect(lg).connect(bp.frequency);
    lfo.start(0);
    n.connect(bp).connect(g).connect(ctx.destination);
  }
  n.start(0);
  return finish(ctx, 1.5);
}

async function drone(sr: number): Promise<AudioBuffer> {
  const secs = 10;
  const ctx = offline(secs, sr);
  const lp = filter(ctx, 'lowpass', 300, 1);
  const lfo = osc(ctx, 'sine', 0.1);
  const lg = ctx.createGain();
  lg.gain.value = 150;
  lfo.connect(lg).connect(lp.frequency);
  lfo.start(0);
  const g = ctx.createGain();
  g.gain.value = 0.25;
  lp.connect(g).connect(ctx.destination);
  const parts: [OscillatorType, number, number, number][] = [
    ['sawtooth', 55, -7, 0.5],
    ['sawtooth', 55, 7, 0.5],
    ['sawtooth', 110, 4, 0.25],
    ['sine', 27.5, 0, 0.8],
  ];
  for (const [type, f, det, gain] of parts) {
    const o = osc(ctx, type, f);
    o.detune.value = det;
    const og = ctx.createGain();
    og.gain.value = gain;
    o.connect(og).connect(lp);
    o.start(0);
  }
  return finish(ctx, 3);
}

async function crickets(sr: number): Promise<AudioBuffer> {
  const secs = 6;
  const ctx = offline(secs, sr);
  const bugs = [
    { f: 4200, rate: 0.26, vol: 0.5 },
    { f: 4900, rate: 0.31, vol: 0.35 },
  ];
  for (const bug of bugs) {
    for (let t = rnd(0, 0.2); t < secs - 0.15; t += bug.rate * rnd(0.9, 1.1)) {
      const o = osc(ctx, 'sine', bug.f * rnd(0.98, 1.02));
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, t);
      for (let p = 0; p < 5; p++) {
        const pt = t + p * 0.02;
        e.gain.linearRampToValueAtTime(bug.vol, pt + 0.004);
        e.gain.linearRampToValueAtTime(0, pt + 0.012);
      }
      o.connect(e).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.12);
    }
  }
  return finish(ctx, 0.5);
}

// ---------------------------------------------------------------- nature one-shots

async function thunder(sr: number): Promise<AudioBuffer> {
  const ctx = offline(4, sr);
  const n = noise(ctx, 4, 'brown');
  const lp = filter(ctx, 'lowpass', 160, 1);
  lp.frequency.setValueAtTime(160, 0);
  lp.frequency.exponentialRampToValueAtTime(60, 3.5);
  const e = env(ctx, [[0, 0], [0.15, 1], [0.8, 0.5], [1.1, 0.8], [2.2, 0.25], [3.9, 0]]);
  n.connect(lp).connect(e).connect(ctx.destination);
  n.start(0);
  return finish(ctx);
}

async function bird(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.5, sr);
  for (let k = 0; k < 3; k++) {
    const t = k * 0.14;
    const o = osc(ctx, 'sine', 2600);
    o.frequency.setValueAtTime(2600, t);
    o.frequency.exponentialRampToValueAtTime(4200, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(3100, t + 0.1);
    const e = env(ctx, [[t, 0], [t + 0.01, 0.6], [t + 0.11, 0]]);
    o.connect(e).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.12);
  }
  return finish(ctx);
}

async function owl(sr: number): Promise<AudioBuffer> {
  const ctx = offline(1, sr);
  for (const t of [0, 0.38]) {
    const o = osc(ctx, 'sine', 420);
    o.frequency.setValueAtTime(420, t);
    o.frequency.linearRampToValueAtTime(370, t + 0.3);
    const lp = filter(ctx, 'lowpass', 900, 1);
    const e = env(ctx, [[t, 0], [t + 0.05, 0.7], [t + 0.2, 0.6], [t + 0.34, 0]]);
    o.connect(lp).connect(e).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.36);
  }
  return finish(ctx);
}

// ---------------------------------------------------------------- drums

async function kick(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.45, sr);
  const o = osc(ctx, 'sine', 160);
  o.frequency.setValueAtTime(160, 0);
  o.frequency.exponentialRampToValueAtTime(45, 0.2);
  const e = env(ctx, [[0, 1], [0.35, 0]]);
  o.connect(e).connect(ctx.destination);
  o.start(0);
  o.stop(0.4);
  const click = noise(ctx, 0.02);
  const ce = env(ctx, [[0, 0.5], [0.015, 0]]);
  click.connect(ce).connect(ctx.destination);
  click.start(0);
  return finish(ctx);
}

async function snare(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.3, sr);
  const n = noise(ctx, 0.3);
  const bp = filter(ctx, 'bandpass', 1800, 0.8);
  const e = env(ctx, [[0, 0.8], [0.18, 0]]);
  n.connect(bp).connect(e).connect(ctx.destination);
  n.start(0);
  const o = osc(ctx, 'sine', 185);
  const oe = env(ctx, [[0, 0.6], [0.1, 0]]);
  o.connect(oe).connect(ctx.destination);
  o.start(0);
  o.stop(0.12);
  return finish(ctx);
}

async function hat(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.12, sr);
  const n = noise(ctx, 0.12);
  const hp = filter(ctx, 'highpass', 7500, 1);
  const e = env(ctx, [[0, 0.6], [0.07, 0]]);
  n.connect(hp).connect(e).connect(ctx.destination);
  n.start(0);
  return finish(ctx);
}

async function clap(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.3, sr);
  const n = noise(ctx, 0.3);
  const bp = filter(ctx, 'bandpass', 1300, 1);
  const g = ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(0.0001, 0);
  for (const t of [0, 0.012, 0.024]) {
    p.setValueAtTime(0.7, t);
    p.exponentialRampToValueAtTime(0.05, t + 0.011);
  }
  p.setValueAtTime(0.6, 0.036);
  p.exponentialRampToValueAtTime(0.0001, 0.25);
  n.connect(bp).connect(g).connect(ctx.destination);
  n.start(0);
  return finish(ctx);
}

async function tom(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.4, sr);
  const o = osc(ctx, 'sine', 170);
  o.frequency.setValueAtTime(170, 0);
  o.frequency.exponentialRampToValueAtTime(75, 0.25);
  const e = env(ctx, [[0, 0.9], [0.35, 0]]);
  o.connect(e).connect(ctx.destination);
  o.start(0);
  o.stop(0.38);
  return finish(ctx);
}

// ---------------------------------------------------------------- game effects

async function blip(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.1, sr);
  const o = osc(ctx, 'square', 660);
  o.frequency.setValueAtTime(660, 0);
  o.frequency.setValueAtTime(990, 0.05);
  const e = env(ctx, [[0, 0.4], [0.09, 0]]);
  o.connect(e).connect(ctx.destination);
  o.start(0);
  o.stop(0.1);
  return finish(ctx);
}

async function coin(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.5, sr);
  const o = osc(ctx, 'square', 1975);
  o.frequency.setValueAtTime(1975, 0);
  o.frequency.setValueAtTime(2637, 0.08);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.3, 0);
  g.gain.setValueAtTime(0.3, 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, 0.48);
  o.connect(g).connect(ctx.destination);
  o.start(0);
  o.stop(0.5);
  return finish(ctx);
}

async function sword(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.35, sr);
  const n = noise(ctx, 0.35);
  const bp = filter(ctx, 'bandpass', 300, 2);
  bp.frequency.setValueAtTime(300, 0);
  bp.frequency.exponentialRampToValueAtTime(3500, 0.15);
  bp.frequency.exponentialRampToValueAtTime(500, 0.33);
  const e = env(ctx, [[0, 0], [0.12, 0.9], [0.34, 0]]);
  n.connect(bp).connect(e).connect(ctx.destination);
  n.start(0);
  return finish(ctx);
}

async function footstep(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.15, sr);
  const n = noise(ctx, 0.15, 'brown');
  const lp = filter(ctx, 'lowpass', 250, 1);
  const e = env(ctx, [[0, 0], [0.005, 1], [0.12, 0]]);
  n.connect(lp).connect(e).connect(ctx.destination);
  n.start(0);
  return finish(ctx);
}

async function magic(sr: number): Promise<AudioBuffer> {
  const ctx = offline(1.3, sr);
  const lfo = osc(ctx, 'sine', 6);
  const lg = ctx.createGain();
  lg.gain.value = 25;
  lfo.connect(lg);
  lfo.start(0);
  [1, 1.5, 2, 2.5, 3].forEach((ratio, k) => {
    const t = k * 0.06;
    const o = osc(ctx, 'triangle', 440 * ratio);
    o.frequency.setValueAtTime(440 * ratio, t);
    o.frequency.exponentialRampToValueAtTime(880 * ratio, t + 1);
    lg.connect(o.detune);
    const e = env(ctx, [[t, 0], [t + 0.05, 0.2], [t + 1.1, 0]]);
    o.connect(e).connect(ctx.destination);
    o.start(t);
    o.stop(t + 1.15);
  });
  return finish(ctx);
}

async function hit(sr: number): Promise<AudioBuffer> {
  const ctx = offline(0.5, sr);
  const o = osc(ctx, 'sine', 90);
  o.frequency.setValueAtTime(90, 0);
  o.frequency.exponentialRampToValueAtTime(35, 0.2);
  const e = env(ctx, [[0, 1], [0.4, 0]]);
  o.connect(e).connect(ctx.destination);
  o.start(0);
  o.stop(0.45);
  const n = noise(ctx, 0.2);
  const lp = filter(ctx, 'lowpass', 800, 1);
  const ne = env(ctx, [[0, 0.6], [0.15, 0]]);
  n.connect(lp).connect(ne).connect(ctx.destination);
  n.start(0);
  return finish(ctx);
}

export const BUILTINS: BuiltinDef[] = [
  { id: 'wind', name: 'Wind', icon: '🌬️', category: 'ambience', loop: true, make: wind },
  { id: 'rain', name: 'Rain', icon: '🌧️', category: 'ambience', loop: true, make: rain },
  { id: 'fire', name: 'Fire', icon: '🔥', category: 'ambience', loop: true, make: fire },
  { id: 'stream', name: 'Stream', icon: '💧', category: 'ambience', loop: true, make: stream },
  { id: 'drone', name: 'Dark drone', icon: '🌌', category: 'ambience', loop: true, make: drone },
  { id: 'crickets', name: 'Crickets', icon: '🦗', category: 'ambience', loop: true, make: crickets },
  { id: 'thunder', name: 'Thunder', icon: '⛈️', category: 'nature', loop: false, make: thunder },
  { id: 'bird', name: 'Bird', icon: '🐦', category: 'nature', loop: false, make: bird },
  { id: 'owl', name: 'Owl', icon: '🦉', category: 'nature', loop: false, make: owl },
  { id: 'kick', name: 'Kick', icon: '🥁', category: 'drums', loop: false, make: kick },
  { id: 'snare', name: 'Snare', icon: '🪘', category: 'drums', loop: false, make: snare },
  { id: 'hat', name: 'Hi-hat', icon: '🎩', category: 'drums', loop: false, make: hat },
  { id: 'clap', name: 'Clap', icon: '👏', category: 'drums', loop: false, make: clap },
  { id: 'tom', name: 'Tom', icon: '🛢️', category: 'drums', loop: false, make: tom },
  { id: 'blip', name: 'Blip', icon: '🔘', category: 'fx', loop: false, make: blip },
  { id: 'coin', name: 'Coin', icon: '🪙', category: 'fx', loop: false, make: coin },
  { id: 'sword', name: 'Sword swing', icon: '⚔️', category: 'fx', loop: false, make: sword },
  { id: 'footstep', name: 'Footstep', icon: '👣', category: 'fx', loop: false, make: footstep },
  { id: 'magic', name: 'Magic', icon: '✨', category: 'fx', loop: false, make: magic },
  { id: 'hit', name: 'Hit', icon: '💥', category: 'fx', loop: false, make: hit },
];

export const BUILTIN_BY_ID = new Map(BUILTINS.map((b) => [b.id, b]));
