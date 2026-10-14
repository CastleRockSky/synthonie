/** A synthetic reverb impulse: decaying stereo noise, normalised to unit energy. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay = 2.5): AudioBuffer {
  const len = Math.max(1, Math.floor(Math.max(0.1, seconds) * ctx.sampleRate));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let energy = 0;
    for (let i = 0; i < len; i++) {
      const v = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      d[i] = v;
      energy += v * v;
    }
    const k = energy > 0 ? 1 / Math.sqrt(energy) : 1;
    for (let i = 0; i < len; i++) d[i] *= k;
  }
  return buf;
}
