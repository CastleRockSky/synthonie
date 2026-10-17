// The bridge the Electron shell puts on `window.zekeDesktop` (electron/preload.cjs sets it
// up; electron/main.cjs does the work). In a plain browser it is undefined and fs.ts
// uses the web APIs instead. Keep the two sides of this interface in step by hand.

/** A native dialog filter: a label and the allowed extensions without the dot. */
export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface DesktopFile {
  /** Full path on disk. Kept so Save can overwrite the file later without asking. */
  path: string;
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export interface DesktopBridge {
  /** Native "Save as" dialog. Resolves to the chosen path, or undefined if cancelled. */
  showSaveDialog(opts: { suggestedName: string; filter: DialogFilter }): Promise<string | undefined>;
  /** Native "Open" dialog that also reads the chosen files. Empty if cancelled. */
  openFiles(opts: { filter: DialogFilter; multiple: boolean }): Promise<DesktopFile[]>;
  /** Overwrite a file that one of the dialogs above handed out. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  /**
   * Projects double-clicked in Explorer (or passed on the command line), both at launch and
   * while the app is running. Subscribe once the app can load a project; a file given at
   * launch arrives straight away. Returns a function that stops listening.
   */
  onOpenProject(callback: (file: DesktopFile) => void): () => void;
}

declare global {
  interface Window {
    zekeDesktop?: DesktopBridge;
  }
}

/** The bridge when running inside the desktop app, otherwise undefined. */
export function desktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.zekeDesktop;
}
