// Pitch detection for the tuner: normalised autocorrelation over one analyser buffer,
// with a parabolic fit on the peak for sub-sample accuracy. Pure, so it is unit-tested.

import { midiToName } from './scales';

export interface Pitch {
  /** Hz */
  freq: number;
  /** Nearest MIDI note. */
  midi: number;
  /** Like "E2". */
  name: string;
  /** How far above (+) or below (-) the nearest note, in cents. */
  cents: number;
  /** 0..1, how periodic the signal looked; below ~0.8 the reading is doubtful. */
  clarity: number;
}

const MIN_FREQ = 55; // A1, below a guitar's low E
const MAX_FREQ = 1200;

export function detectPitch(buf: Float32Array, sampleRate: number, minRms = 0.008): Pitch | null {
  const n = buf.length;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / n) < minRms) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const maxLag = Math.min(n - 2, Math.floor(sampleRate / MIN_FREQ));
  if (maxLag <= minLag) return null;

  // Normalised square difference: 1 = perfectly periodic at this lag, 0 = unrelated.
  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0;
    let m = 0;
    for (let i = 0; i < n - lag; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      ac += a * b;
      m += a * a + b * b;
    }
    nsdf[lag] = m > 0 ? (2 * ac) / m : 0;
  }

  // Pick the first peak that is close to the global maximum (avoids octave errors).
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) if (nsdf[lag] > best) best = nsdf[lag];
  if (best < 0.5) return null;
  const threshold = best * 0.9;
  let lagAt = -1;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (nsdf[lag] >= threshold && nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
      lagAt = lag;
      break;
    }
  }
  if (lagAt < 0) return null;

  // Parabolic interpolation around the peak.
  const y0 = nsdf[lagAt - 1];
  const y1 = nsdf[lagAt];
  const y2 = nsdf[lagAt + 1];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const period = lagAt + shift;
  const freq = sampleRate / period;
  if (!(freq >= MIN_FREQ && freq <= MAX_FREQ)) return null;

  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiFloat);
  return { freq, midi, name: midiToName(midi), cents: Math.round((midiFloat - midi) * 100), clarity: Math.min(1, y1) };
}
