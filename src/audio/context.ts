// One shared AudioContext for the whole app. Browsers start it suspended until the
// user interacts, so unlockAudio() is called from every button that makes sound.

let ctx: AudioContext | undefined;

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  return ctx;
}

export async function unlockAudio(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {
      /* will retry on the next gesture */
    }
  }
  return c;
}
