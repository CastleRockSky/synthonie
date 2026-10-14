// The one SoundBank and one Engine, wired to the store.

import { SoundBank } from '../audio/bank';
import { getAudioContext } from '../audio/context';
import { Engine } from '../audio/engine';
import { useStore } from '../model/store';

export const bank = new SoundBank();
export const engine = new Engine(getAudioContext, bank, () => useStore.getState().project);

engine.onPlayingChange = (playing) => useStore.getState().setPlaying(playing);
useStore.subscribe((s) => engine.sync(s.project));
