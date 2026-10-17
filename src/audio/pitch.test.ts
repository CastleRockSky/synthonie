import { describe, expect, it } from 'vitest';
import { detectPitch } from './pitch';

function tone(freq: number, sampleRate: number, length: number, amp = 0.3): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // a fundamental with a couple of harmonics, like a plucked string
    out[i] = amp * (Math.sin(2 * Math.PI * freq * t) + 0.4 * Math.sin(2 * Math.PI * 2 * freq * t) + 0.2 * Math.sin(2 * Math.PI * 3 * freq * t));
  }
  return out;
}

describe('detectPitch', () => {
  const sr = 48000;

  it('finds the low E string', () => {
    const p = detectPitch(tone(82.41, sr, 4096), sr);
    expect(p).not.toBeNull();
    expect(p!.name).toBe('E2');
    expect(Math.abs(p!.cents)).toBeLessThan(5);
  });

  it('finds a high E and reports sharpness in cents', () => {
    const sharp = 329.63 * Math.pow(2, 20 / 1200); // E4 + 20 cents
    const p = detectPitch(tone(sharp, sr, 4096), sr);
    expect(p!.name).toBe('E4');
    expect(p!.cents).toBeGreaterThan(14);
    expect(p!.cents).toBeLessThan(26);
  });

  it('returns null for silence and for noise', () => {
    expect(detectPitch(new Float32Array(4096), sr)).toBeNull();
    const noise = Float32Array.from({ length: 4096 }, () => (Math.random() * 2 - 1) * 0.3);
    const p = detectPitch(noise, sr);
    expect(p === null || p.clarity < 0.9).toBe(true);
  });
});
