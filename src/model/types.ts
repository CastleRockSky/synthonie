// The whole project document. Everything the user makes lives in one immutable
// Project object (see store.ts); this is also exactly what gets saved to disk.

export type SoundId = string;
export type SoundKind = 'builtin' | 'file';
export type SoundCategory = 'ambience' | 'nature' | 'drums' | 'fx' | 'mine';

export interface SoundMeta {
  id: SoundId;
  name: string;
  icon: string;
  kind: SoundKind;
  category: SoundCategory;
  /** For kind 'builtin': which generator in audio/builtins.ts makes it. */
  builtinId?: string;
  /** For kind 'file': the file extension of the stored bytes (wav, mp3, ogg...). */
  ext?: string;
}

/** How a soundscape layer plays its sound. */
export type LayerMode = 'loop' | 'once' | 'random';

export interface Layer {
  id: string;
  soundId: SoundId;
  mode: LayerMode;
  /** 0..1 */
  volume: number;
  /** -1 (left) .. 1 (right) */
  pan: number;
  /** Playback rate: 0.5 = one octave down, 2 = one octave up. */
  pitch: number;
  /** 0..1, 1 = fully open. Maps to a low-pass filter cutoff. */
  muffle: number;
  /** 0..1 reverb send. */
  space: number;
  /** Random mode: seconds between plays. */
  randomMin: number;
  randomMax: number;
  /** Random mode: 0..1 how much the pitch wobbles per play. */
  randomPitch: number;
  muted: boolean;
}

export interface DrumRow {
  id: string;
  soundId: SoundId;
  steps: boolean[];
  volume: number;
  pitch: number;
  muted: boolean;
}

export type InstrumentId = 'pluck' | 'lead' | 'pad' | 'bass' | 'bell';
export type ScaleId = 'majorPent' | 'minorPent';

export interface MelodyTrack {
  instrument: InstrumentId;
  /** cells[row][step]; row 0 is the highest note. */
  cells: boolean[][];
  volume: number;
  muted: boolean;
}

export interface Pattern {
  bpm: number;
  steps: 16 | 32;
  /** 0..1 */
  swing: number;
  /** Number of melody rows (pitches). */
  rows: number;
  scale: ScaleId;
  /** 0 = C, 1 = C#, ... 11 = B */
  root: number;
  /** Base octave of the lowest melody row. */
  octave: number;
  drums: DrumRow[];
  melody: MelodyTrack;
  /** Beat bus volume 0..1 */
  volume: number;
  /** Beat reverb send 0..1 */
  space: number;
}

export interface MasterSettings {
  volume: number;
  /** Reverb length in seconds. */
  reverbSize: number;
  /** Reverb return level 0..1 */
  reverbMix: number;
}

export interface Project {
  version: 1;
  name: string;
  sounds: SoundMeta[];
  layers: Layer[];
  pattern: Pattern;
  master: MasterSettings;
  sceneEnabled: boolean;
  beatEnabled: boolean;
}
