// The one SoundBank and one Engine, wired to the store.

import { SoundBank } from '../audio/bank';
import { getAudioContext } from '../audio/context';
import { Engine } from '../audio/engine';
import { GuitarEngine } from '../audio/guitar';
import { useStore } from '../model/store';

export const bank = new SoundBank();
export const engine = new Engine(getAudioContext, bank, () => useStore.getState().project);
export const guitar = new GuitarEngine(getAudioContext, useStore.getState().project.guitar);

engine.onPlayingChange = (playing) => useStore.getState().setPlaying(playing);
useStore.subscribe((s) => engine.sync(s.project));

let lastRig = useStore.getState().project.guitar;
useStore.subscribe((s) => {
  if (s.project.guitar !== lastRig) {
    lastRig = s.project.guitar;
    guitar.apply(lastRig);
  }
});
