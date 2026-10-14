// The melody instruments: a couple of oscillators -> low-pass filter -> amp envelope.
// Everything is data in INSTRUMENTS, so adding an instrument means adding an entry.

import type { InstrumentId } from '../model/types';

export interface OscSpec {
  type: OscillatorType;
  /** Frequency multiplier (2 = one octave up, 0.5 = down). */
  ratio: number;
  /** Cents. */
  detune: number;
  gain: number;
}

export interface Instrument {
  id: InstrumentId;
  name: string;
  icon: string;
  oscs: OscSpec[];
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** Filter cutoff at rest (Hz) and how far the envelope pushes it up. */
  filter: number;
  filterEnv: number;
  filterQ: number;
  /** Octave shift applied to the whole grid for this instrument. */
  octave: number;
  gain: number;
}

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  pluck: {
    id: 'pluck', name: 'Pluck', icon: '🪕',
    oscs: [
      { type: 'triangle', ratio: 1, detune: 0, gain: 0.6 },
      { type: 'square', ratio: 1, detune: 0, gain: 0.25 },
    ],
    attack: 0.004, decay: 0.18, sustain: 0.15, release: 0.12,
    filter: 1800, filterEnv: 2600, filterQ: 1, octave: 0, gain: 0.5,
  },
  lead: {
    id: 'lead', name: 'Lead', icon: '🎺',
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: -5, gain: 0.5 },
      { type: 'sawtooth', ratio: 1, detune: 5, gain: 0.5 },
    ],
    attack: 0.01, decay: 0.12, sustain: 0.7, release: 0.15,
    filter: 1500, filterEnv: 2500, filterQ: 2, octave: 0, gain: 0.35,
  },
  pad: {
    id: 'pad', name: 'Pad', icon: '🌫️',
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: -10, gain: 0.4 },
      { type: 'sawtooth', ratio: 1, detune: 10, gain: 0.4 },
      { type: 'triangle', ratio: 2, detune: 0, gain: 0.15 },
    ],
    attack: 0.25, decay: 0.4, sustain: 0.8, release: 0.9,
    filter: 900, filterEnv: 600, filterQ: 1, octave: 0, gain: 0.3,
  },
  bass: {
    id: 'bass', name: 'Bass', icon: '🐘',
    oscs: [
      { type: 'square', ratio: 1, detune: 0, gain: 0.5 },
      { type: 'sine', ratio: 0.5, detune: 0, gain: 0.6 },
    ],
    attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.1,
    filter: 500, filterEnv: 900, filterQ: 1.5, octave: -1, gain: 0.5,
  },
  bell: {
    id: 'bell', name: 'Bell', icon: '🔔',
    oscs: [
      { type: 'sine', ratio: 1, detune: 0, gain: 0.6 },
      { type: 'sine', ratio: 2.76, detune: 0, gain: 0.25 },
      { type: 'sine', ratio: 5.4, detune: 0, gain: 0.1 },
    ],
    attack: 0.002, decay: 0.6, sustain: 0, release: 0.4,
    filter: 6000, filterEnv: 0, filterQ: 0.5, octave: 1, gain: 0.4,
  },
};

export const INSTRUMENT_LIST = Object.values(INSTRUMENTS);

/** Schedule one note. Works on live and offline contexts alike. */
export function playNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  inst: Instrument,
  freq: number,
  time: number,
  duration: number,
  velocity = 1,
): void {
  const peak = inst.gain * velocity;
  const end = Math.max(time + inst.attack + 0.01, time + duration);
  const stopAt = end + inst.release * 4 + 0.05;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + inst.attack);
  amp.gain.setTargetAtTime(peak * inst.sustain, time + inst.attack, inst.decay / 3);
  amp.gain.setTargetAtTime(0, end, inst.release / 3);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = inst.filterQ;
  const base = Math.min(inst.filter, 18000);
  filter.frequency.setValueAtTime(Math.min(base + inst.filterEnv, 18000), time);
  filter.frequency.setTargetAtTime(base, time, inst.decay / 2);

  filter.connect(amp).connect(dest);

  for (const o of inst.oscs) {
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.value = freq * o.ratio;
    osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.value = o.gain;
    osc.connect(g).connect(filter);
    osc.start(time);
    osc.stop(stopAt);
  }
}
