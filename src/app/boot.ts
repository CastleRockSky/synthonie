// Startup: generate the built-in sounds, restore the autosaved project, start autosaving,
// then let the desktop app hand over a project that was double-clicked.

import { getAudioContext } from '../audio/context';
import { applyRememberedOutput } from '../audio/output';
import { restoreAutosave, startAutosave } from '../files/autosave';
import { kvGet, kvSet } from '../files/kv';
import { newProject, normalizeProject } from '../model/defaults';
import type { UserPreset } from '../model/guitar-presets';
import { useStore } from '../model/store';
import { watchDesktopProjects } from './actions';
import { bank } from './instances';

const PRESETS_KEY = 'guitarPresets';

let booted = false;

export async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  const ctx = getAudioContext();
  void applyRememberedOutput(ctx);
  await bank.loadBuiltins(ctx);
  const restored = await restoreAutosave(ctx, bank);
  const st = useStore.getState();
  if (restored) st.setProject(normalizeProject(restored.project), { clean: true, fileName: restored.fileName });
  else st.setProject(newProject(), { clean: true });
  await loadGuitarPresets();
  startAutosave();
  st.setReady(true);
  watchDesktopProjects();
}

/** Saved guitar presets live in IndexedDB on this machine, outside any project. */
async function loadGuitarPresets(): Promise<void> {
  try {
    const saved = await kvGet<UserPreset[]>(PRESETS_KEY);
    if (Array.isArray(saved)) useStore.getState().setGuitarPresets(saved);
  } catch (e) {
    console.warn('could not load guitar presets', e);
  }
  useStore.subscribe((s, prev) => {
    if (s.guitarPresets !== prev.guitarPresets) kvSet(PRESETS_KEY, s.guitarPresets).catch((e) => console.warn('could not save guitar presets', e));
  });
}
