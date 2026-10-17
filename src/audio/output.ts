// Which device the whole app plays through. Chromium lets a page pick the output device
// (AudioContext.setSinkId), which matters for the guitar: headphones on the interface's
// own jack have far less delay than Bluetooth or a monitor's HDMI audio.

const KEY = 'synthonie.outputDevice';

export interface AudioOutputInfo {
  deviceId: string;
  label: string;
}

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

export function canChooseOutput(ctx: AudioContext): boolean {
  return typeof (ctx as SinkContext).setSinkId === 'function';
}

export function rememberedOutput(): string {
  try {
    return localStorage.getItem(KEY) ?? 'default';
  } catch {
    return 'default';
  }
}

export async function listOutputs(): Promise<AudioOutputInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audiooutput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || (d.deviceId === 'default' ? 'Default output' : `Output ${i + 1}`) }));
}

/** Route the context to a device. 'default' means whatever Windows has as the default. */
export async function applyOutput(ctx: AudioContext, deviceId: string): Promise<void> {
  const c = ctx as SinkContext;
  if (!c.setSinkId) throw new Error('This browser cannot choose the output device.');
  await c.setSinkId(deviceId === 'default' ? '' : deviceId);
}

export async function setOutput(ctx: AudioContext, deviceId: string): Promise<void> {
  await applyOutput(ctx, deviceId);
  try {
    localStorage.setItem(KEY, deviceId);
  } catch {
    /* fine */
  }
}

/** At startup: use the remembered device if it is still there, otherwise fall back quietly. */
export async function applyRememberedOutput(ctx: AudioContext): Promise<void> {
  const id = rememberedOutput();
  if (id === 'default' || !canChooseOutput(ctx)) return;
  try {
    await applyOutput(ctx, id);
  } catch {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* fine */
    }
  }
}
