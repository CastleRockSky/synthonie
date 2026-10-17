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

// ---- The guitar rig (pedalboard). Every knob is 0..1; src/audio/guitar.ts maps them to units. ----

export interface GatePedal {
  on: boolean;
  threshold: number;
}
export interface CompPedal {
  on: boolean;
  amount: number;
}
export interface DrivePedal {
  on: boolean;
  drive: number;
  tone: number;
  level: number;
}
export interface AmpPedal {
  on: boolean;
  gain: number;
  bass: number;
  mid: number;
  treble: number;
  /** Speaker cabinet simulation. */
  cab: boolean;
}
export interface ChorusPedal {
  on: boolean;
  rate: number;
  depth: number;
  mix: number;
}
export interface TremoloPedal {
  on: boolean;
  rate: number;
  depth: number;
}
export interface DelayPedal {
  on: boolean;
  time: number;
  feedback: number;
  mix: number;
}
export interface ReverbPedal {
  on: boolean;
  size: number;
  mix: number;
}

export type PedalKey = 'gate' | 'comp' | 'drive' | 'amp' | 'chorus' | 'tremolo' | 'delay' | 'reverb';

export interface GuitarRig {
  version: 1;
  /** The preset last applied, or null once a knob was moved. */
  preset: string | null;
  inputGain: number;
  /** Hear the pedalboard through the speakers. */
  monitor: boolean;
  volume: number;
  gate: GatePedal;
  comp: CompPedal;
  drive: DrivePedal;
  amp: AmpPedal;
  chorus: ChorusPedal;
  tremolo: TremoloPedal;
  delay: DelayPedal;
  reverb: ReverbPedal;
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
  /** The guitar pedalboard (added in v0.3; older files get the default rig when loaded). */
  guitar: GuitarRig;
}
