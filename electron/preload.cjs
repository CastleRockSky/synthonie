// Runs inside the page before the app, with access to Electron's IPC. It exposes the
// tiny `window.synthonieDesktop` bridge (typed in src/files/desktop.ts) and nothing else:
// the page never sees Node or Electron directly.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('synthonieDesktop', {
  showSaveDialog: (opts) => ipcRenderer.invoke('synthonie:save-dialog', opts),
  openFiles: (opts) => ipcRenderer.invoke('synthonie:open-files', opts),
  writeFile: (filePath, bytes) => ipcRenderer.invoke('synthonie:write-file', filePath, bytes),
  // Projects double-clicked in Explorer, at launch or while the app is running. Subscribing
  // tells the main process the page is ready, so a file given at launch arrives right away.
  onOpenProject: (callback) => {
    const listener = (_event, file) => callback(file);
    ipcRenderer.on('synthonie:open-project', listener);
    ipcRenderer.send('synthonie:open-project-ready');
    return () => ipcRenderer.removeListener('synthonie:open-project', listener);
  },
});
