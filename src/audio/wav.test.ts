import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';

describe('encodeWav', () => {
  it('writes a valid 16-bit stereo header and interleaved samples', () => {
    const left = Float32Array.from([0, 0.5, -1]);
    const right = Float32Array.from([1, -0.5, 0]);
    const bytes = encodeWav([left, right], 44100);
    const v = new DataView(bytes.buffer);
    const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));

    expect(bytes.length).toBe(44 + 3 * 2 * 2);
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(tag(12)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // channels
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint16(34, true)).toBe(16); // bits
    expect(tag(36)).toBe('data');
    expect(v.getUint32(40, true)).toBe(12);

    expect(v.getInt16(44, true)).toBe(0); // L0
    expect(v.getInt16(46, true)).toBe(32767); // R0
    expect(v.getInt16(48, true)).toBe(Math.round(0.5 * 32767)); // L1
    expect(v.getInt16(52, true)).toBe(-32768); // L2 clamps to full scale
  });
});
