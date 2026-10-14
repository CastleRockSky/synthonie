// 16-bit PCM WAV encoder. Pure function so it is testable in Node.

export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array<ArrayBuffer> {
  const numCh = channels.length;
  const len = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM format
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true); // bits per sample
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, Math.round(s < 0 ? s * 32768 : s * 32767), true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

export function audioBufferChannels(buf: AudioBuffer): Float32Array[] {
  const out: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) out.push(buf.getChannelData(c));
  return out;
}

export function audioBufferToWav(buf: AudioBuffer): Uint8Array<ArrayBuffer> {
  return encodeWav(audioBufferChannels(buf), buf.sampleRate);
}

/** Build an AudioBuffer from raw channel data (any context; buffers are context-independent). */
export function channelsToAudioBuffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
  const out = new AudioBuffer({ numberOfChannels: channels.length, length: channels[0]?.length ?? 1, sampleRate });
  channels.forEach((d, i) => copyChannel(out, d, i));
  return out;
}

/** copyToChannel wants a plain ArrayBuffer-backed array in newer DOM typings; all ours are. */
export function copyChannel(buf: AudioBuffer, data: Float32Array, channel: number): void {
  buf.copyToChannel(data as Float32Array<ArrayBuffer>, channel);
}
