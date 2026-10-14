// Decoded audio lives here, outside React state: the project only stores metadata.

import type { SoundId } from '../model/types';
import { BUILTINS } from './builtins';
import { computePeaks } from './dsp';
import { audioBufferChannels } from './wav';

export interface StoredBytes {
  bytes: Uint8Array;
  ext: string;
}

export const builtinSoundId = (builtinId: string): SoundId => `bi_${builtinId}`;

export class SoundBank {
  readonly buffers = new Map<SoundId, AudioBuffer>();
  /** Original encoded bytes for 'file' sounds (what gets written into the project zip). */
  readonly bytes = new Map<SoundId, StoredBytes>();
  private readonly peaksCache = new Map<string, Float32Array>();

  get(id: SoundId): AudioBuffer | undefined {
    return this.buffers.get(id);
  }

  duration(id: SoundId): number {
    return this.buffers.get(id)?.duration ?? 0;
  }

  peaks(id: SoundId, bins = 120): Float32Array | undefined {
    const key = `${id}:${bins}`;
    const hit = this.peaksCache.get(key);
    if (hit) return hit;
    const buf = this.buffers.get(id);
    if (!buf) return undefined;
    const p = computePeaks(audioBufferChannels(buf), bins);
    this.peaksCache.set(key, p);
    return p;
  }

  async loadBuiltins(ctx: BaseAudioContext): Promise<void> {
    await Promise.all(
      BUILTINS.map(async (b) => {
        const id = builtinSoundId(b.id);
        if (!this.buffers.has(id)) this.buffers.set(id, await b.make(ctx.sampleRate));
      }),
    );
  }

  /** Decode encoded audio (wav/mp3/ogg/...) and keep both the bytes and the buffer. */
  async addFile(ctx: BaseAudioContext, id: SoundId, bytes: Uint8Array, ext: string): Promise<AudioBuffer> {
    // decodeAudioData detaches the buffer it is given, so hand it a copy.
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const buf = await ctx.decodeAudioData(copy);
    this.buffers.set(id, buf);
    this.bytes.set(id, { bytes, ext });
    this.forgetPeaks(id);
    return buf;
  }

  /** Keep a buffer we made ourselves (a recording) together with its encoded bytes. */
  addBuffer(id: SoundId, buf: AudioBuffer, bytes: Uint8Array, ext: string): void {
    this.buffers.set(id, buf);
    this.bytes.set(id, { bytes, ext });
    this.forgetPeaks(id);
  }

  remove(id: SoundId): void {
    this.buffers.delete(id);
    this.bytes.delete(id);
    this.forgetPeaks(id);
  }

  private forgetPeaks(id: SoundId): void {
    for (const key of this.peaksCache.keys()) if (key.startsWith(`${id}:`)) this.peaksCache.delete(key);
  }
}
