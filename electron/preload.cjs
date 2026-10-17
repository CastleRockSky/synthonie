// Runs inside the page before the app, with access to Electron's IPC. It exposes the
// tiny `window.zekeDesktop` bridge (typed in src/files/desktop.ts) and nothing else:
// the page never sees Node or Electron directly.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zekeDesktop', {
  showSaveDialog: (opts) => ipcRenderer.invoke('zeke:save-dialog', opts),
  openFiles: (opts) => ipcRenderer.invoke('zeke:open-files', opts),
  writeFile: (filePath, bytes) => ipcRenderer.invoke('zeke:write-file', filePath, bytes),
  // Projects double-clicked in Explorer, at launch or while the app is running. Subscribing
  // tells the main process the page is ready, so a file given at launch arrives right away.
  onOpenProject: (callback) => {
    const listener = (_event, file) => callback(file);
    ipcRenderer.on('zeke:open-project', listener);
    ipcRenderer.send('zeke:open-project-ready');
    return () => ipcRenderer.removeListener('zeke:open-project', listener);
  },
});
