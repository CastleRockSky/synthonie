import { describe, expect, it } from 'vitest';
import { midiToFreq, midiToName, rowToMidi } from './scales';

describe('scales', () => {
  it('A minor pentatonic rows climb through the right notes', () => {
    const names = Array.from({ length: 10 }, (_, r) => midiToName(rowToMidi(r, 'minorPent', 9, 3)));
    expect(names).toEqual(['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5']);
  });

  it('C major pentatonic starts on C4 at octave 4', () => {
    expect(midiToName(rowToMidi(0, 'majorPent', 0, 4))).toBe('C4');
    expect(midiToName(rowToMidi(5, 'majorPent', 0, 4))).toBe('C5');
  });

  it('A4 is 440 Hz', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBe(880);
  });
});
