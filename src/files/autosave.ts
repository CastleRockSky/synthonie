// Keeps the current project (and its sound bytes) in IndexedDB so closing the window
// loses nothing. Sound bytes are stored when a sound is added, the project document
// shortly after every change.

import type { SoundBank } from '../audio/bank';
import { useStore } from '../model/store';
import type { Project, SoundId } from '../model/types';
import { dropSounds } from '../model/defaults';
import { kvDel, kvGet, kvKeys, kvSet } from './kv';

const PROJECT_KEY = 'project';
const META_KEY = 'meta';
const soundKey = (id: SoundId) => `sound:${id}`;

interface Meta {
  fileName: string | null;
}

export async function persistSoundBytes(id: SoundId, bytes: Uint8Array, ext: string): Promise<void> {
  try {
    await kvSet(soundKey(id), { bytes, ext });
  } catch (e) {
    console.warn('autosave: could not store sound bytes', e);
  }
}

export async function forgetSoundBytes(id: SoundId): Promise<void> {
  try {
    await kvDel(soundKey(id));
  } catch {
    /* nothing to do */
  }
}

export async function restoreAutosave(ctx: BaseAudioContext, bank: SoundBank): Promise<{ project: Project; fileName: string | null } | undefined> {
  try {
    const project = await kvGet<Project>(PROJECT_KEY);
    if (!project || project.version !== 1) return undefined;
    const meta = (await kvGet<Meta>(META_KEY)) ?? { fileName: null };
    const missing = new Set<SoundId>();
    for (const s of project.sounds) {
      if (s.kind !== 'file') continue;
      const rec = await kvGet<{ bytes: Uint8Array; ext: string }>(soundKey(s.id));
      if (!rec) {
        missing.add(s.id);
        continue;
      }
      try {
        await bank.addFile(ctx, s.id, rec.bytes, rec.ext);
      } catch {
        missing.add(s.id);
      }
    }
    return { project: dropSounds(project, missing), fileName: meta.fileName };
  } catch (e) {
    console.warn('autosave: restore failed', e);
    return undefined;
  }
}

/** Start watching the store; writes 800 ms after the last change. */
export function startAutosave(): void {
  let timer: number | undefined;
  let lastProject = useStore.getState().project;
  let lastFile = useStore.getState().fileName;
  useStore.subscribe((s) => {
    if (s.project === lastProject && s.fileName === lastFile) return;
    lastProject = s.project;
    lastFile = s.fileName;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void save(s.project, s.fileName);
    }, 800);
  });
}

async function save(project: Project, fileName: string | null): Promise<void> {
  try {
    await kvSet(PROJECT_KEY, project);
    await kvSet(META_KEY, { fileName } satisfies Meta);
    // Drop bytes of sounds that are no longer in the project.
    const live = new Set(project.sounds.map((s) => soundKey(s.id)));
    for (const key of await kvKeys()) {
      const k = String(key);
      if (k.startsWith('sound:') && !live.has(k)) await kvDel(k);
    }
  } catch (e) {
    console.warn('autosave: save failed', e);
  }
}
