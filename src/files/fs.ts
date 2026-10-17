// Saving and opening files. Inside the desktop app this goes through the Electron bridge
// (native dialogs, and Save overwrites the opened file). In a browser it uses the File
// System Access API when available (Edge/Chrome: native dialogs, Save can overwrite the
// opened file), otherwise it falls back to a download link and a file input.

import { desktopBridge, type DialogFilter } from './desktop';

export const PROJECT_TYPE: FilePickerAcceptType = { description: 'Zeke Synth project', accept: { 'application/zip': ['.zekeproj'] } };
export const WAV_TYPE: FilePickerAcceptType = { description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } };
export const AUDIO_TYPE: FilePickerAcceptType = {
  description: 'Audio files',
  accept: { 'audio/*': ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.webm', '.opus'] },
};

export function toBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type });
}

/**
 * Where a saved or opened file lives, so Save can overwrite it later without asking:
 * a browser file handle, or a path when running in the desktop app.
 */
export type FileRef = { kind: 'handle'; handle: FileSystemFileHandle } | { kind: 'path'; path: string };

export interface SavedFile {
  ref?: FileRef;
  name: string;
}

/** With a ref, overwrites silently (Save); without, asks where (Save as). Undefined if cancelled. */
export async function saveBytes(
  bytes: Uint8Array,
  suggestedName: string,
  type: FilePickerAcceptType,
  mime: string,
  ref?: FileRef,
): Promise<SavedFile | undefined> {
  const desktop = desktopBridge();
  if (desktop) {
    const path = ref?.kind === 'path' ? ref.path : await desktop.showSaveDialog({ suggestedName, filter: toFilter(type) });
    if (!path) return undefined;
    await desktop.writeFile(path, bytes);
    return { ref: { kind: 'path', path }, name: fileNameOf(path) };
  }
  if (window.showSaveFilePicker) {
    try {
      const h = ref?.kind === 'handle' ? ref.handle : await window.showSaveFilePicker({ suggestedName, types: [type] });
      const w = await h.createWritable();
      await w.write(toBlob(bytes, mime));
      await w.close();
      return { ref: { kind: 'handle', handle: h }, name: h.name };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return undefined;
      throw e;
    }
  }
  const url = URL.createObjectURL(toBlob(bytes, mime));
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { name: suggestedName };
}

export interface OpenedFile {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  ref?: FileRef;
}

export async function openFiles(type: FilePickerAcceptType, multiple: boolean): Promise<OpenedFile[]> {
  const desktop = desktopBridge();
  if (desktop) {
    const files = await desktop.openFiles({ filter: toFilter(type), multiple });
    return files.map((f) => ({ name: f.name, bytes: f.bytes, ref: { kind: 'path', path: f.path } }));
  }
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({ multiple, types: [type] });
      return Promise.all(
        handles.map(async (h) => {
          const f = await h.getFile();
          return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), ref: { kind: 'handle', handle: h } as FileRef };
        }),
      );
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return [];
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    input.accept = Object.values(type.accept).flat().join(',');
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** The browser picker's accept type as a native dialog filter ("Audio files", ["wav", "mp3"]). */
function toFilter(type: FilePickerAcceptType): DialogFilter {
  return {
    name: type.description ?? 'Files',
    extensions: Object.values(type.accept)
      .flat()
      .map((ext) => ext.replace(/^\./, '')),
  };
}

/** The last part of a path, whichever slashes it uses. */
function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : 'bin';
}

export function baseName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '');
}

/** A file-system friendly version of a project name. */
export function safeName(name: string): string {
  return name.replace(/[\/:*?"<>|]+/g, '-').trim() || 'untitled';
}
