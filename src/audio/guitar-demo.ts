// A built-in guitar riff (Karplus-Strong plucked strings) so the pedalboard can be tried
// without plugging anything in. Also what the tests and the "Demo riff" input use.

import { midiToFreq } from './scales';

/** [midi note, beats]; a two-bar E minor riff at 100 bpm. */
const RIFF: [number, number][] = [
  [40, 1], [43, 0.5], [45, 0.5], [40, 1], [43, 0.5], [47, 0.5],
  [45, 1], [43, 0.5], [40, 0.5], [38, 1], [40, 2],
];
const BPM = 100;

/** Pluck one string into `out` starting at `at`, for `seconds`. */
function pluck(out: Float32Array, sampleRate: number, freq: number, at: number, seconds: number, loud: number): void {
  const period = Math.max(2, Math.round(sampleRate / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = (Math.random() * 2 - 1) * loud;
  // a touch of low-pass on the excitation takes the fizz off the attack
  for (let i = 1; i < period; i++) ring[i] = 0.5 * (ring[i] + ring[i - 1]);
  const end = Math.min(out.length, Math.floor((at + seconds) * sampleRate));
  let idx = 0;
  let last = 0;
  for (let i = Math.floor(at * sampleRate); i < end; i++) {
    const sample = ring[idx];
    // the string: average with the previous sample, lose a little energy each round
    const next = 0.5 * (sample + last) * 0.996;
    last = sample;
    ring[idx] = next;
    out[i] += sample;
    idx = (idx + 1) % period;
  }
}

export function renderDemoRiff(sampleRate: number): Float32Array {
  const beat = 60 / BPM;
  const total = RIFF.reduce((s, [, b]) => s + b, 0) * beat;
  const out = new Float32Array(Math.ceil(total * sampleRate));
  let t = 0;
  for (const [midi, beats] of RIFF) {
    pluck(out, sampleRate, midiToFreq(midi), t, beats * beat * 1.1, 0.5);
    t += beats * beat;
  }
  // About the level a real guitar interface delivers, so the pedals behave the same for both.
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.3 / peak;
  return out;
}
