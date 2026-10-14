// Startup: generate the built-in sounds, restore the autosaved project, start autosaving.

import { getAudioContext } from '../audio/context';
import { restoreAutosave, startAutosave } from '../files/autosave';
import { newProject, withAllBuiltins } from '../model/defaults';
import { useStore } from '../model/store';
import { bank } from './instances';

let booted = false;

export async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  const ctx = getAudioContext();
  await bank.loadBuiltins(ctx);
  const restored = await restoreAutosave(ctx, bank);
  const st = useStore.getState();
  if (restored) st.setProject(withAllBuiltins(restored.project), { clean: true, fileName: restored.fileName });
  else st.setProject(newProject(), { clean: true });
  startAutosave();
  st.setReady(true);
}
