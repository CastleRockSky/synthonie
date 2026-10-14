// Minimal typings for the File System Access API (not in lib.dom for every TS version).
// It is only available in Chromium browsers; every call site checks for it first.

declare global {
  interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
  }

  interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
    id?: string;
  }

  interface OpenFilePickerOptions {
    multiple?: boolean;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
    id?: string;
  }

  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
  }

  // Debug handle exposed in main.tsx so you can poke the engine from DevTools:
  //   zeke.engine.play(), zeke.store.getState().project, ...
  // eslint-disable-next-line no-var
  var zeke: Record<string, unknown> | undefined;
}

export {};
