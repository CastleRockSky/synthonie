import { describe, expect, it } from 'vitest';
import { encodeOgg } from './ogg';

describe('encodeOgg', () => {
  it('produces an Ogg Vorbis stream with the right header, much smaller than raw audio', async () => {
    const sr = 44100;
    const n = sr; // one second
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.5;
      right[i] = Math.sin((2 * Math.PI * 660 * i) / sr) * 0.5;
    }
    const progress: number[] = [];
    const ogg = await encodeOgg([left, right], sr, 5, (f) => progress.push(f));

    // Ogg page capture pattern, then the Vorbis identification header:
    // "\x01vorbis" + version(4) + channels(1) + sampleRate(4, little-endian)
    expect(String.fromCharCode(...ogg.subarray(0, 4))).toBe('OggS');
    const head = Array.from(ogg.subarray(0, 128), (b) => String.fromCharCode(b)).join('');
    const at = head.indexOf('\x01vorbis');
    expect(at).toBeGreaterThan(0);
    const view = new DataView(ogg.buffer, ogg.byteOffset);
    expect(ogg[at + 11]).toBe(2); // channels
    expect(view.getUint32(at + 12, true)).toBe(sr);

    expect(ogg.length).toBeGreaterThan(2000);
    expect(ogg.length).toBeLessThan((n * 2 * 2) / 4); // under a quarter of 16-bit stereo WAV
    expect(progress.at(-1)).toBe(1);
  }, 30000);

  it('rejects more than two channels', async () => {
    const ch = new Float32Array(10);
    await expect(encodeOgg([ch, ch, ch], 44100)).rejects.toThrow(/mono or stereo/);
  });
});
