import { describe, expect, it } from 'vitest';
import { GUITAR_PRESETS, PEDAL_ORDER, defaultRig, rigToPreset } from '../model/guitar-presets';
import { shaperCurve, softLimitCurve } from './guitar';
import { renderDemoRiff } from './guitar-demo';

describe('softLimitCurve', () => {
  it('leaves normal levels alone, eases loud ones, and never reaches full scale', () => {
    const c = softLimitCurve(4001); // index i maps to a signal of (i / 4000 * 2 - 1) * 2
    expect(c[2000]).toBe(0); // 0
    expect(c[2500]).toBeCloseTo(0.5, 6); // 0.5 passes through untouched
    expect(c[2800]).toBeCloseTo(0.8, 6); // the knee
    expect(c[3000]).toBeLessThan(1); // 1.0 is eased
    expect(c[3000]).toBeGreaterThan(0.9);
    expect(c[4000]).toBeLessThan(1); // 2.0 still under the ceiling
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
    expect(c[1500]).toBeCloseTo(-c[2500], 6); // symmetric
  });
});

describe('rigToPreset', () => {
  it('drops the machine-specific fields and copies the rest', () => {
    const rig = defaultRig();
    const p = rigToPreset(rig) as unknown as Record<string, unknown>;
    for (const field of ['version', 'preset', 'inputGain', 'monitor']) expect(field in p, field).toBe(false);
    expect(p.amp).toEqual(rig.amp);
    expect(p.amp).not.toBe(rig.amp);
    expect(p.volume).toBe(rig.volume);
  });
});

describe('shaperCurve', () => {
  for (const kind of ['soft', 'tube'] as const) {
    it(`${kind}: stays within -1..1, passes through zero and never bends back`, () => {
      const c = shaperCurve(kind, 1001);
      expect(c.length).toBe(1001);
      expect(Math.abs(c[500])).toBeLessThan(1e-6);
      for (let i = 0; i < c.length; i++) {
        expect(c[i]).toBeGreaterThanOrEqual(-1);
        expect(c[i]).toBeLessThanOrEqual(1);
        if (i > 0) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
      }
      expect(c[0]).toBeCloseTo(-1, 5);
      expect(c[1000]).toBeCloseTo(1, 5);
    });
  }

  it('tube clips the negative half harder than the positive half', () => {
    const c = shaperCurve('tube', 1001);
    // at x = +0.5 vs x = -0.5 the magnitudes differ (even harmonics come from this)
    expect(Math.abs(c[250])).toBeGreaterThan(Math.abs(c[750]));
  });
});

describe('renderDemoRiff', () => {
  it('renders two bars of plucked notes, normalised and not silent at the end', () => {
    const sr = 22050;
    const out = renderDemoRiff(sr);
    const beats = 9; // the riff is 9 beats at 100 bpm
    expect(out.length).toBe(Math.ceil(beats * 0.6 * sr));
    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    expect(peak).toBeCloseTo(0.3, 3);
    let tailEnergy = 0;
    for (let i = out.length - sr; i < out.length; i++) tailEnergy += out[i] * out[i];
    expect(tailEnergy).toBeGreaterThan(0);
  });
});

describe('guitar presets', () => {
  it('every preset sets every pedal with knobs in 0..1', () => {
    for (const [name, preset] of Object.entries(GUITAR_PRESETS)) {
      for (const key of PEDAL_ORDER) {
        const pedal = preset[key] as unknown as Record<string, unknown>;
        expect(typeof pedal.on, `${name}.${key}.on`).toBe('boolean');
        for (const [field, value] of Object.entries(pedal)) {
          if (typeof value === 'number') {
            expect(value, `${name}.${key}.${field}`).toBeGreaterThanOrEqual(0);
            expect(value, `${name}.${key}.${field}`).toBeLessThanOrEqual(1);
          }
        }
      }
      expect(preset.volume).toBeGreaterThan(0);
    }
  });

  it('the default rig is the Clean preset and is a fresh copy each time', () => {
    const a = defaultRig();
    const b = defaultRig();
    expect(a.preset).toBe('Clean');
    expect(a).toEqual(b);
    expect(a.amp).not.toBe(b.amp);
  });
});
