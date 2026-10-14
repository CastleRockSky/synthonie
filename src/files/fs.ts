// Saving and opening files. Uses the File System Access API when the browser has it
// (Edge/Chrome: native dialogs, and Save can overwrite the opened file), otherwise falls
// back to a download link and a file input.

export const PROJECT_TYPE: FilePickerAcceptType = { description: 'Zeke Synth project', accept: { 'application/zip': ['.zekeproj'] } };
export const WAV_TYPE: FilePickerAcceptType = { description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } };
export const AUDIO_TYPE: FilePickerAcceptType = {
  description: 'Audio files',
  accept: { 'audio/*': ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.webm', '.opus'] },
};

export function toBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type });
}

export interface SavedFile {
  handle?: FileSystemFileHandle;
  name: string;
}

/** With a handle, overwrites silently (Save); without, asks where (Save as). Undefined if cancelled. */
export async function saveBytes(
  bytes: Uint8Array,
  suggestedName: string,
  type: FilePickerAcceptType,
  mime: string,
  handle?: FileSystemFileHandle,
): Promise<SavedFile | undefined> {
  if (window.showSaveFilePicker) {
    try {
      const h = handle ?? (await window.showSaveFilePicker({ suggestedName, types: [type] }));
      const w = await h.createWritable();
      await w.write(toBlob(bytes, mime));
      await w.close();
      return { handle: h, name: h.name };
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
  handle?: FileSystemFileHandle;
}

export async function openFiles(type: FilePickerAcceptType, multiple: boolean): Promise<OpenedFile[]> {
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({ multiple, types: [type] });
      return Promise.all(
        handles.map(async (h) => {
          const f = await h.getFile();
          return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), handle: h };
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
