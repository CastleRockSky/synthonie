import { describe, expect, it } from 'vitest';
import { applyEdgeFades, computePeaks, crossfadeLoop, normalizeChannels, trimSilence } from './dsp';

describe('crossfadeLoop', () => {
  it('shortens the clip by the fade length and keeps the untouched middle', () => {
    const src = Float32Array.from({ length: 100 }, (_, i) => i);
    const [out] = crossfadeLoop([src], 10, true);
    expect(out.length).toBe(90);
    expect(out[50]).toBe(50);
  });

  it('with headFade the start fades in from (almost) the tail only', () => {
    const src = Float32Array.from({ length: 100 }, () => 1);
    const [out] = crossfadeLoop([src], 10, true);
    // At i=0 head gain is 0 and tail gain is 1, so the value is the tail sample (1).
    expect(out[0]).toBeCloseTo(1, 5);
    // Equal-power crossfade of two equal signals stays near 1 (slightly above in the middle).
    expect(out[5]).toBeGreaterThan(0.99);
  });

  it('without headFade the first sample is kept intact plus the folded tail', () => {
    const src = new Float32Array(100);
    src[0] = 0.5; // a transient at sample 0
    src[95] = 0.25; // part of the tail that folds onto sample 5
    const [out] = crossfadeLoop([src], 10, false);
    expect(out[0]).toBe(0.5);
    expect(out[5]).toBeCloseTo(0.25 * Math.cos((0.5 * Math.PI) / 2), 5);
  });

  it('never fades more than half the clip', () => {
    const src = new Float32Array(20);
    const [out] = crossfadeLoop([src], 500, true);
    expect(out.length).toBe(10);
  });
});

describe('trimSilence', () => {
  it('cuts quiet lead-in and tail, keeping padding', () => {
    const sr = 1000;
    const s = new Float32Array(1000);
    for (let i = 400; i < 600; i++) s[i] = 0.5;
    const out = trimSilence(s, sr, 0.02, 0.03);
    // 200 loud samples + 30 padding on each side
    expect(out.length).toBe(260);
  });

  it('leaves an all-silent take alone', () => {
    const s = new Float32Array(100);
    expect(trimSilence(s, 1000)).toBe(s);
  });
});

describe('applyEdgeFades', () => {
  it('starts and ends at zero', () => {
    const s = Float32Array.from({ length: 100 }, () => 1);
    applyEdgeFades(s, 1000, 0.01);
    expect(s[0]).toBe(0);
    expect(s[99]).toBe(0);
    expect(s[50]).toBe(1);
  });
});

describe('computePeaks / normalizeChannels', () => {
  it('finds the loudest sample per bin across channels', () => {
    const a = new Float32Array(10);
    const b = new Float32Array(10);
    a[1] = 0.2;
    b[7] = -0.9;
    const peaks = computePeaks([a, b], 2);
    expect(peaks[0]).toBeCloseTo(0.2);
    expect(peaks[1]).toBeCloseTo(0.9);
  });

  it('normalizes to the target peak', () => {
    const a = Float32Array.from([0.1, -0.5, 0.25]);
    normalizeChannels([a], 1);
    expect(Math.max(...Array.from(a).map(Math.abs))).toBeCloseTo(1);
  });
});
