// Ogg Vorbis encoding, the format RPG Maker (and Godot, Unity, Unreal) read directly.
// Uses the reference Vorbis encoder compiled to WebAssembly. It is loaded on first use,
// so the main bundle stays small and the WASM is only paid for when someone exports.

import type { WasmMediaEncoder } from 'wasm-media-encoders';
import { audioBufferChannels } from './wav';

/**
 * Vorbis quality, -1 (worst) to 10 (best). 5 is roughly 160 kbit/s for stereo: transparent
 * for game audio and about a tenth of the size of 16-bit WAV.
 */
export const OGG_QUALITY = 5;

let encoderPromise: Promise<WasmMediaEncoder<'audio/ogg'>> | undefined;

function getEncoder(): Promise<WasmMediaEncoder<'audio/ogg'>> {
  if (!encoderPromise) {
    encoderPromise = import('wasm-media-encoders').then((m) => m.createOggEncoder());
    encoderPromise.catch(() => {
      encoderPromise = undefined; // let the next export retry the load
    });
  }
  return encoderPromise;
}

/** Encode mono or stereo float samples. onProgress gets 0..1 as the encode advances. */
export async function encodeOgg(
  channels: Float32Array[],
  sampleRate: number,
  quality = OGG_QUALITY,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  if (channels.length < 1 || channels.length > 2) throw new Error('OGG export supports mono or stereo only.');
  const encoder = await getEncoder();
  encoder.configure({ channels: channels.length as 1 | 2, sampleRate, vbrQuality: quality });

  const chunks: Uint8Array[] = [];
  let total = 0;
  const keep = (data: Uint8Array) => {
    if (!data.length) return;
    const copy = data.slice(); // the encoder reuses its output buffer between calls
    chunks.push(copy);
    total += copy.length;
  };

  const len = channels[0].length;
  const block = sampleRate; // one second per call keeps WASM memory flat and progress smooth
  for (let i = 0; i < len; i += block) {
    const end = Math.min(len, i + block);
    keep(encoder.encode(channels.map((ch) => ch.subarray(i, end))));
    onProgress?.(end / len);
  }
  keep(encoder.finalize());

  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function audioBufferToOgg(buf: AudioBuffer, quality = OGG_QUALITY, onProgress?: (fraction: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  return encodeOgg(audioBufferChannels(buf), buf.sampleRate, quality, onProgress);
}
