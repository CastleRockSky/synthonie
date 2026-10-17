// Everything the top bar and library buttons do: new/open/save, import, record, export.

import { getAudioContext } from '../audio/context';
import { patternSeconds } from '../audio/engine';
import { OGG_QUALITY, audioBufferToOgg } from '../audio/ogg';
import { audioBufferToWav, copyChannel, encodeWav } from '../audio/wav';
import { forgetSoundBytes, persistSoundBytes } from '../files/autosave';
import { desktopBridge, type DesktopFile } from '../files/desktop';
import { AUDIO_TYPE, OGG_TYPE, PROJECT_TYPE, WAV_TYPE, baseName, extOf, openFiles, safeName, saveBytes, type FileRef } from '../files/fs';
import { packProject, unpackProject } from '../files/project-file';
import { PROJECT_EXT, dropSounds, newProject as makeNewProject, uid, normalizeProject } from '../model/defaults';
import { useStore } from '../model/store';
import type { Project, SoundId } from '../model/types';
import { bank, engine } from './instances';

/** The file the current project was opened from / saved to, so Save can overwrite it silently. */
let fileRef: FileRef | undefined;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function newProject(): void {
  const st = useStore.getState();
  if (st.dirty && !window.confirm('Start a new project? Unsaved changes will be lost.')) return;
  engine.stop();
  fileRef = undefined;
  st.setProject(makeNewProject(), { clean: true, fileName: null });
}

export async function openProject(): Promise<void> {
  const [file] = await openFiles(PROJECT_TYPE, false);
  if (!file) return;
  try {
    await loadProjectBytes(file.bytes, file.name, file.ref);
  } catch (e) {
    window.alert(`Could not open that file.\n${msg(e)}`);
  }
}

/**
 * Inside the desktop app, open the projects that get double-clicked in Explorer (or passed
 * on the command line). Called once at the end of boot; in a browser it does nothing.
 */
export function watchDesktopProjects(): void {
  desktopBridge()?.onOpenProject((file) => void openDesktopProject(file));
}

async function openDesktopProject(file: DesktopFile): Promise<void> {
  if (useStore.getState().dirty && !window.confirm(`Open ${file.name}? Unsaved changes will be lost.`)) return;
  try {
    await loadProjectBytes(file.bytes, file.name, { kind: 'path', path: file.path });
  } catch (e) {
    window.alert(`Could not open that file.\n${msg(e)}`);
  }
}

export async function loadProjectBytes(bytes: Uint8Array, fileName: string | null, ref?: FileRef): Promise<void> {
  const { project, sounds } = unpackProject(bytes);
  const ctx = getAudioContext();
  const bad = new Set<SoundId>();
  for (const s of project.sounds) {
    if (s.kind !== 'file') continue;
    const rec = sounds.get(s.id);
    if (!rec) {
      bad.add(s.id);
      continue;
    }
    try {
      await bank.addFile(ctx, s.id, rec.bytes, rec.ext);
      await persistSoundBytes(s.id, rec.bytes, rec.ext);
    } catch {
      bad.add(s.id);
    }
  }
  engine.stop();
  fileRef = ref;
  useStore.getState().setProject(normalizeProject(dropSounds(project, bad)), { clean: true, fileName });
  if (bad.size) window.alert(`${bad.size} sound(s) in this project could not be loaded and were skipped.`);
}

export async function saveProject(saveAs: boolean): Promise<void> {
  const st = useStore.getState();
  const bytes = packProject(st.project, bank);
  const name = `${safeName(st.project.name)}.${PROJECT_EXT}`;
  try {
    const res = await saveBytes(bytes, name, PROJECT_TYPE, 'application/zip', saveAs ? undefined : fileRef);
    if (!res) return;
    fileRef = res.ref;
    st.markClean(res.name);
  } catch (e) {
    window.alert(`Could not save.\n${msg(e)}`);
  }
}

export async function importAudio(): Promise<void> {
  const files = await openFiles(AUDIO_TYPE, true);
  await importOpened(files);
}

export async function importAudioFiles(files: File[]): Promise<void> {
  const opened = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  await importOpened(opened);
}

async function importOpened(files: { name: string; bytes: Uint8Array }[]): Promise<void> {
  const ctx = getAudioContext();
  const st = useStore.getState();
  const failed: string[] = [];
  for (const f of files) {
    const id = uid('snd');
    const ext = extOf(f.name);
    try {
      await bank.addFile(ctx, id, f.bytes, ext);
      await persistSoundBytes(id, f.bytes, ext);
      st.addSound({ id, name: baseName(f.name), icon: '🎵', kind: 'file', category: 'mine', ext });
    } catch {
      failed.push(f.name);
    }
  }
  if (failed.length) window.alert(`Could not read: ${failed.join(', ')}\nTry WAV, MP3 or OGG files.`);
}

export async function addRecording(samples: Float32Array, sampleRate: number, name: string): Promise<void> {
  const id = uid('rec');
  const wav = encodeWav([samples], sampleRate);
  const buf = getAudioContext().createBuffer(1, samples.length, sampleRate);
  copyChannel(buf, samples, 0);
  bank.addBuffer(id, buf, wav, 'wav');
  await persistSoundBytes(id, wav, 'wav');
  useStore.getState().addSound({ id, name, icon: '🎤', kind: 'file', category: 'mine', ext: 'wav' });
}

export async function removeSound(id: SoundId): Promise<void> {
  useStore.getState().removeSound(id);
  bank.remove(id);
  await forgetSoundBytes(id);
}

export function hasBeatContent(p: Project): boolean {
  if (!p.beatEnabled) return false;
  const pt = p.pattern;
  const drums = pt.drums.some((d) => !d.muted && d.steps.some(Boolean));
  const melody = !pt.melody.muted && pt.melody.cells.some((row) => row.some(Boolean));
  return drums || melody;
}

export function loopSeconds(p: Project): number {
  return patternSeconds(p.pattern);
}

/** WAV is uncompressed and universal; OGG (Vorbis) is what RPG Maker, Godot and Unity read, at a tenth of the size. */
export type ExportFormat = 'wav' | 'ogg';

export interface ExportOptions {
  seconds: number;
  /** Seconds of tail folded into the start for a seamless loop; 0 for none. */
  crossfade: number;
  format: ExportFormat;
  /** Short status text as the export moves through rendering and encoding. */
  onProgress?: (status: string) => void;
}

/** Render the project and save it. Resolves false if the save dialog was cancelled. */
export async function exportAudio(opts: ExportOptions): Promise<boolean> {
  const p = useStore.getState().project;
  opts.onProgress?.('Rendering…');
  const buf = await engine.render(p, opts.seconds, { loopCrossfade: opts.crossfade, headFade: !hasBeatContent(p) });
  const name = safeName(p.name);
  if (opts.format === 'ogg') {
    const ogg = await audioBufferToOgg(buf, OGG_QUALITY, (f) => opts.onProgress?.(`Encoding ${Math.round(f * 100)}%…`));
    opts.onProgress?.('Saving…');
    return !!(await saveBytes(ogg, `${name}.ogg`, OGG_TYPE, 'audio/ogg'));
  }
  opts.onProgress?.('Saving…');
  return !!(await saveBytes(audioBufferToWav(buf), `${name}.wav`, WAV_TYPE, 'audio/wav'));
}
