// All app state in one zustand store. The Project is immutable: every action returns a
// new object, which is what lets the engine diff old vs new and apply changes live.

import { create } from 'zustand';
import { emptyCells, newDrumRow, newLayer, newProject, resizeSteps } from './defaults';
import { GUITAR_PRESETS, rigToPreset, type UserPreset } from './guitar-presets';
import type { DrumRow, GuitarRig, Layer, MasterSettings, MelodyTrack, Pattern, PedalKey, Project, SoundId, SoundMeta } from './types';

export type Tab = 'scene' | 'beat' | 'guitar';

export interface AppState {
  project: Project;
  playing: boolean;
  tab: Tab;
  /** Unsaved changes since the last Save/Open/New. */
  dirty: boolean;
  /** Name of the file this project was opened from or saved to. */
  fileName: string | null;
  /** False until built-in sounds are generated and the autosave is restored. */
  ready: boolean;
  /** Guitar presets the kid saved; loaded from IndexedDB at boot, not part of the project. */
  guitarPresets: UserPreset[];

  setProject: (p: Project, opts?: { clean?: boolean; fileName?: string | null }) => void;
  update: (fn: (p: Project) => Project) => void;
  markClean: (fileName?: string | null) => void;
  setTab: (t: Tab) => void;
  setPlaying: (b: boolean) => void;
  setReady: (b: boolean) => void;
  setName: (name: string) => void;

  addSound: (meta: SoundMeta) => void;
  renameSound: (id: SoundId, name: string) => void;
  removeSound: (id: SoundId) => void;

  addLayer: (soundId: SoundId, loop: boolean) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  removeLayer: (id: string) => void;

  addDrumRow: (soundId: SoundId) => void;
  updateDrumRow: (id: string, patch: Partial<DrumRow>) => void;
  removeDrumRow: (id: string) => void;
  setDrumStep: (id: string, step: number, value: boolean) => void;

  setMelodyCell: (row: number, step: number, value: boolean) => void;
  updateMelody: (patch: Partial<MelodyTrack>) => void;
  clearMelody: () => void;

  updatePattern: (patch: Partial<Pattern>) => void;
  updateMaster: (patch: Partial<MasterSettings>) => void;
  setSceneEnabled: (b: boolean) => void;
  setBeatEnabled: (b: boolean) => void;

  /** Rig-level settings (input gain, monitor, volume); keeps the preset name. */
  updateGuitar: (patch: Partial<GuitarRig>) => void;
  /** A pedal's knobs or switch; marks the rig as edited (preset null). */
  updatePedal: <K extends PedalKey>(pedal: K, patch: Partial<GuitarRig[K]>) => void;
  /** Built-in or saved preset by name. */
  applyGuitarPreset: (name: string) => void;
  setGuitarPresets: (list: UserPreset[]) => void;
  /** Keep the current pedal settings under a name (replacing a saved preset of that name). */
  saveGuitarPreset: (name: string) => void;
  deleteGuitarPreset: (name: string) => void;
}

export const useStore = create<AppState>()((set) => {
  const update = (fn: (p: Project) => Project) => set((s) => ({ project: fn(s.project), dirty: true }));
  const patchPattern = (fn: (pt: Pattern) => Pattern) => update((p) => ({ ...p, pattern: fn(p.pattern) }));

  return {
    project: newProject(),
    playing: false,
    tab: 'scene',
    dirty: false,
    fileName: null,
    ready: false,
    guitarPresets: [],

    setProject: (project, opts) => set({ project, dirty: !opts?.clean, fileName: opts?.fileName ?? null }),
    update,
    markClean: (fileName) => set((s) => ({ dirty: false, fileName: fileName === undefined ? s.fileName : fileName })),
    setTab: (tab) => set({ tab }),
    setPlaying: (playing) => set({ playing }),
    setReady: (ready) => set({ ready }),
    setName: (name) => update((p) => ({ ...p, name })),

    addSound: (meta) => update((p) => ({ ...p, sounds: [...p.sounds, meta] })),
    renameSound: (id, name) => update((p) => ({ ...p, sounds: p.sounds.map((s) => (s.id === id ? { ...s, name } : s)) })),
    removeSound: (id) =>
      update((p) => ({
        ...p,
        sounds: p.sounds.filter((s) => s.id !== id),
        layers: p.layers.filter((l) => l.soundId !== id),
        pattern: { ...p.pattern, drums: p.pattern.drums.filter((d) => d.soundId !== id) },
      })),

    addLayer: (soundId, loop) => update((p) => ({ ...p, layers: [...p.layers, newLayer(soundId, loop)] })),
    updateLayer: (id, patch) => update((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
    removeLayer: (id) => update((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) })),

    addDrumRow: (soundId) => patchPattern((pt) => ({ ...pt, drums: [...pt.drums, newDrumRow(soundId, pt.steps)] })),
    updateDrumRow: (id, patch) => patchPattern((pt) => ({ ...pt, drums: pt.drums.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
    removeDrumRow: (id) => patchPattern((pt) => ({ ...pt, drums: pt.drums.filter((d) => d.id !== id) })),
    setDrumStep: (id, step, value) =>
      patchPattern((pt) => ({
        ...pt,
        drums: pt.drums.map((d) => {
          if (d.id !== id || d.steps[step] === value) return d;
          const steps = d.steps.slice();
          steps[step] = value;
          return { ...d, steps };
        }),
      })),

    setMelodyCell: (row, step, value) =>
      patchPattern((pt) => {
        if (pt.melody.cells[row]?.[step] === value) return pt;
        const cells = pt.melody.cells.map((r) => r.slice());
        cells[row][step] = value;
        return { ...pt, melody: { ...pt.melody, cells } };
      }),
    updateMelody: (patch) => patchPattern((pt) => ({ ...pt, melody: { ...pt.melody, ...patch } })),
    clearMelody: () => patchPattern((pt) => ({ ...pt, melody: { ...pt.melody, cells: emptyCells(pt.rows, pt.steps) } })),

    updatePattern: (patch) =>
      patchPattern((pt) => {
        const next = { ...pt, ...patch };
        if (next.steps !== pt.steps) {
          next.drums = next.drums.map((d) => ({ ...d, steps: resizeSteps(d.steps, next.steps) }));
          next.melody = { ...next.melody, cells: next.melody.cells.map((r) => resizeSteps(r, next.steps)) };
        }
        return next;
      }),
    updateMaster: (patch) => update((p) => ({ ...p, master: { ...p.master, ...patch } })),
    setSceneEnabled: (sceneEnabled) => update((p) => ({ ...p, sceneEnabled })),
    setBeatEnabled: (beatEnabled) => update((p) => ({ ...p, beatEnabled })),

    updateGuitar: (patch) => update((p) => ({ ...p, guitar: { ...p.guitar, ...patch } })),
    updatePedal: (pedal, patch) =>
      update((p) => {
        const guitar: GuitarRig = { ...p.guitar, preset: null };
        (guitar as unknown as Record<string, unknown>)[pedal] = { ...(p.guitar[pedal] as object), ...(patch as object) };
        return { ...p, guitar };
      }),
    applyGuitarPreset: (name) =>
      set((s) => {
        const preset = GUITAR_PRESETS[name] ?? s.guitarPresets.find((u) => u.name === name)?.rig;
        if (!preset) return s;
        return { project: { ...s.project, guitar: { ...s.project.guitar, ...structuredClone(preset), preset: name } }, dirty: true };
      }),
    setGuitarPresets: (guitarPresets) => set({ guitarPresets }),
    saveGuitarPreset: (name) =>
      set((s) => {
        const trimmed = name.trim();
        if (!trimmed) return s;
        const entry: UserPreset = { name: trimmed, rig: rigToPreset(s.project.guitar) };
        const others = s.guitarPresets.filter((u) => u.name !== trimmed);
        return {
          guitarPresets: [...others, entry],
          project: { ...s.project, guitar: { ...s.project.guitar, preset: trimmed } },
          dirty: true,
        };
      }),
    deleteGuitarPreset: (name) =>
      set((s) => ({
        guitarPresets: s.guitarPresets.filter((u) => u.name !== name),
        project: s.project.guitar.preset === name ? { ...s.project, guitar: { ...s.project.guitar, preset: null } } : s.project,
      })),
  };
});
