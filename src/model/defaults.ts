import { builtinSoundId } from '../audio/bank';
import { BUILTINS } from '../audio/builtins';
import type { DrumRow, Layer, Project, SoundId, SoundMeta } from './types';

export const APP_NAME = 'Zeke Synth';
export const PROJECT_EXT = 'zekeproj';
export const MELODY_ROWS = 10;

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function builtinSoundMetas(): SoundMeta[] {
  return BUILTINS.map((b) => ({
    id: builtinSoundId(b.id),
    name: b.name,
    icon: b.icon,
    kind: 'builtin',
    category: b.category,
    builtinId: b.id,
  }));
}

/** Older project files may predate newer built-ins; make sure they are all listed. */
export function withAllBuiltins(p: Project): Project {
  const have = new Set(p.sounds.map((s) => s.id));
  const missing = builtinSoundMetas().filter((m) => !have.has(m.id));
  return missing.length ? { ...p, sounds: [...p.sounds, ...missing] } : p;
}

/** Remove sounds (and anything using them) from a project. */
export function dropSounds(p: Project, ids: Set<SoundId>): Project {
  if (!ids.size) return p;
  return {
    ...p,
    sounds: p.sounds.filter((s) => !ids.has(s.id)),
    layers: p.layers.filter((l) => !ids.has(l.soundId)),
    pattern: { ...p.pattern, drums: p.pattern.drums.filter((d) => !ids.has(d.soundId)) },
  };
}

export function newLayer(soundId: SoundId, loop: boolean): Layer {
  return {
    id: uid('layer'),
    soundId,
    mode: loop ? 'loop' : 'random',
    volume: 0.8,
    pan: 0,
    pitch: 1,
    muffle: 1,
    space: 0.2,
    randomMin: 3,
    randomMax: 10,
    randomPitch: 0.2,
    muted: false,
  };
}

export function newDrumRow(soundId: SoundId, steps: number): DrumRow {
  return { id: uid('row'), soundId, steps: new Array<boolean>(steps).fill(false), volume: 0.8, pitch: 1, muted: false };
}

export function emptyCells(rows: number, steps: number): boolean[][] {
  return Array.from({ length: rows }, () => new Array<boolean>(steps).fill(false));
}

export function resizeSteps(arr: boolean[], steps: number): boolean[] {
  const out = new Array<boolean>(steps).fill(false);
  for (let i = 0; i < Math.min(steps, arr.length); i++) out[i] = arr[i];
  return out;
}

/** 'x...x...' -> [true, false, false, false, true, ...] */
function stepsFrom(pattern: string): boolean[] {
  return pattern.split('').map((c) => c === 'x');
}

/** The starter project: a campfire scene plus a small beat (switched off) to discover. */
export function newProject(): Project {
  const bi = builtinSoundId;
  const kick = { ...newDrumRow(bi('kick'), 16), steps: stepsFrom('x...x...x...x...') };
  const snare = { ...newDrumRow(bi('snare'), 16), steps: stepsFrom('....x.......x...') };
  const hat = { ...newDrumRow(bi('hat'), 16), steps: stepsFrom('..x...x...x...x.'), volume: 0.5 };

  // A little A-minor pentatonic tune. cells[row][step], row 0 = highest note.
  const cells = emptyCells(MELODY_ROWS, 16);
  const tune: [number, number][] = [[4, 0], [3, 2], [2, 4], [1, 6], [2, 8], [3, 10], [4, 12], [5, 14]];
  for (const [row, step] of tune) cells[row][step] = true;

  return {
    version: 1,
    name: 'Campfire',
    sounds: builtinSoundMetas(),
    layers: [
      { ...newLayer(bi('fire'), true), volume: 0.7, pan: -0.2, space: 0.1 },
      { ...newLayer(bi('wind'), true), volume: 0.35, pan: 0.3, muffle: 0.6 },
      { ...newLayer(bi('crickets'), true), volume: 0.25, pan: 0.5 },
      { ...newLayer(bi('owl'), false), volume: 0.6, pan: -0.6, randomMin: 5, randomMax: 14, randomPitch: 0.15, space: 0.5 },
    ],
    pattern: {
      bpm: 100,
      steps: 16,
      swing: 0,
      rows: MELODY_ROWS,
      scale: 'minorPent',
      root: 9, // A
      octave: 3,
      drums: [kick, snare, hat],
      melody: { instrument: 'pluck', cells, volume: 0.7, muted: false },
      volume: 0.8,
      space: 0.25,
    },
    master: { volume: 0.9, reverbSize: 2, reverbMix: 0.5 },
    sceneEnabled: true,
    beatEnabled: false,
  };
}
