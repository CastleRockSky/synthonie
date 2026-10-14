// Pure sample-math helpers. No Web Audio objects here, so these run in Node tests too.

/**
 * Make a clip loop seamlessly: the last `fadeSamples` are folded onto the start
 * (fading out) and the clip is shortened by that amount. With `headFade` the
 * start also fades in (equal-power crossfade), which suits ambience; without it
 * the start is kept intact, which suits beats whose first hit is at sample 0.
 */
export function crossfadeLoop(channels: Float32Array[], fadeSamples: number, headFade: boolean): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  const fade = Math.max(0, Math.min(Math.floor(fadeSamples), Math.floor(len / 2)));
  const outLen = len - fade;
  return channels.map((src) => {
    const dst = new Float32Array(outLen);
    dst.set(src.subarray(0, outLen));
    for (let i = 0; i < fade; i++) {
      const a = i / fade;
      const tailGain = Math.cos((a * Math.PI) / 2);
      const headGain = headFade ? Math.sin((a * Math.PI) / 2) : 1;
      dst[i] = src[i] * headGain + src[outLen + i] * tailGain;
    }
    return dst;
  });
}

/** Cut silence from both ends of a mono recording, keeping a little padding. */
export function trimSilence(samples: Float32Array, sampleRate: number, threshold = 0.02, padSec = 0.03): Float32Array {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < threshold) start++;
  while (end > start && Math.abs(samples[end - 1]) < threshold) end--;
  if (start >= end) return samples; // all silence: leave it alone
  const pad = Math.floor(padSec * sampleRate);
  start = Math.max(0, start - pad);
  end = Math.min(samples.length, end + pad);
  return samples.slice(start, end);
}

/** Short linear fades at both ends to avoid clicks. Edits in place and returns the array. */
export function applyEdgeFades(samples: Float32Array, sampleRate: number, fadeSec = 0.005): Float32Array {
  const n = Math.min(Math.floor(fadeSec * sampleRate), Math.floor(samples.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    samples[i] *= g;
    samples[samples.length - 1 - i] *= g;
  }
  return samples;
}

/** Peak per bin, for drawing a waveform thumbnail. */
export function computePeaks(channels: Float32Array[], bins: number): Float32Array {
  const out = new Float32Array(bins);
  const len = channels[0]?.length ?? 0;
  if (!len) return out;
  const per = len / bins;
  for (let b = 0; b < bins; b++) {
    const s = Math.floor(b * per);
    const e = Math.max(s + 1, Math.min(len, Math.floor((b + 1) * per)));
    let peak = 0;
    for (const ch of channels) {
      for (let i = s; i < e; i++) {
        const a = Math.abs(ch[i]);
        if (a > peak) peak = a;
      }
    }
    out[b] = peak;
  }
  return out;
}

/** Scale all channels so the loudest sample hits `peakTarget`. Edits in place. */
export function normalizeChannels(channels: Float32Array[], peakTarget = 0.85): void {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  if (peak <= 0) return;
  const k = peakTarget / peak;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= k;
}
