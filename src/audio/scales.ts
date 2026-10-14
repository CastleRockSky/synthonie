import type { ScaleId } from '../model/types';

export const SCALES: Record<ScaleId, { name: string; steps: number[] }> = {
  majorPent: { name: 'Happy (major)', steps: [0, 2, 4, 7, 9] },
  minorPent: { name: 'Spooky (minor)', steps: [0, 3, 5, 7, 10] },
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Melody rows count up from the bottom; this gives the MIDI note of a row. */
export function rowToMidi(rowFromBottom: number, scale: ScaleId, root: number, octave: number): number {
  const steps = SCALES[scale].steps;
  const oct = Math.floor(rowFromBottom / steps.length);
  return 12 * (octave + 1) + root + 12 * oct + steps[rowFromBottom % steps.length];
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
