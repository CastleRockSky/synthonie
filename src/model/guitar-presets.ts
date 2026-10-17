// The guitar rig's defaults and the preset buttons. Every knob is 0..1; the engine
// (src/audio/guitar.ts) maps them to real units, so a preset is just a bag of numbers.

import type { GuitarRig } from './types';

/** The part of a rig a preset sets: the pedals and the volume, not input gain or monitoring. */
export type RigPreset = Omit<GuitarRig, 'version' | 'preset' | 'inputGain' | 'monitor'>;

const CLEAN: RigPreset = {
  volume: 0.8,
  gate: { on: true, threshold: 0.25 },
  comp: { on: true, amount: 0.3 },
  drive: { on: false, drive: 0.4, tone: 0.6, level: 0.6 },
  amp: { on: true, gain: 0.2, bass: 0.5, mid: 0.45, treble: 0.6, cab: true },
  chorus: { on: false, rate: 0.3, depth: 0.4, mix: 0.5 },
  tremolo: { on: false, rate: 0.4, depth: 0.5 },
  delay: { on: false, time: 0.35, feedback: 0.3, mix: 0.3 },
  reverb: { on: true, size: 0.3, mix: 0.2 },
};

export const GUITAR_PRESETS: Record<string, RigPreset> = {
  Clean: CLEAN,
  Crunch: {
    ...CLEAN,
    comp: { on: false, amount: 0.3 },
    drive: { on: true, drive: 0.45, tone: 0.55, level: 0.6 },
    amp: { on: true, gain: 0.45, bass: 0.55, mid: 0.55, treble: 0.55, cab: true },
    reverb: { on: true, size: 0.25, mix: 0.15 },
  },
  Lead: {
    ...CLEAN,
    comp: { on: true, amount: 0.5 },
    drive: { on: true, drive: 0.7, tone: 0.65, level: 0.6 },
    amp: { on: true, gain: 0.6, bass: 0.45, mid: 0.65, treble: 0.6, cab: true },
    delay: { on: true, time: 0.4, feedback: 0.35, mix: 0.25 },
    reverb: { on: true, size: 0.4, mix: 0.25 },
  },
  Heavy: {
    ...CLEAN,
    gate: { on: true, threshold: 0.45 },
    drive: { on: true, drive: 0.9, tone: 0.5, level: 0.55 },
    amp: { on: true, gain: 0.85, bass: 0.65, mid: 0.3, treble: 0.65, cab: true },
    reverb: { on: false, size: 0.3, mix: 0.1 },
  },
  Dreamy: {
    ...CLEAN,
    comp: { on: true, amount: 0.4 },
    amp: { on: true, gain: 0.15, bass: 0.5, mid: 0.4, treble: 0.65, cab: true },
    chorus: { on: true, rate: 0.25, depth: 0.5, mix: 0.6 },
    delay: { on: true, time: 0.55, feedback: 0.55, mix: 0.4 },
    reverb: { on: true, size: 0.8, mix: 0.5 },
  },
  Surf: {
    ...CLEAN,
    amp: { on: true, gain: 0.3, bass: 0.45, mid: 0.4, treble: 0.7, cab: true },
    tremolo: { on: true, rate: 0.45, depth: 0.7 },
    reverb: { on: true, size: 0.55, mix: 0.45 },
  },
};

export const GUITAR_PRESET_NAMES = Object.keys(GUITAR_PRESETS);

/** A preset the kid saved himself. Kept per machine (IndexedDB), outside any project. */
export interface UserPreset {
  name: string;
  rig: RigPreset;
}

export function defaultRig(): GuitarRig {
  return { version: 1, preset: 'Clean', inputGain: 0.5, monitor: true, ...structuredClone(CLEAN) };
}

/** The preset part of a rig: everything except the machine-specific bits. */
export function rigToPreset(rig: GuitarRig): RigPreset {
  const { version: _v, preset: _p, inputGain: _g, monitor: _m, ...rest } = rig;
  return structuredClone(rest);
}

/** Pedal order on the board, which is also the signal order. */
export const PEDAL_ORDER = ['gate', 'comp', 'drive', 'amp', 'chorus', 'tremolo', 'delay', 'reverb'] as const;
