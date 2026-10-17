// The Electron main process: opens the web app in a window and does the few things a
// web page cannot do on its own (native file dialogs, writing files, allowing the
// microphone, opening a project that was double-clicked in Explorer). It runs with Node.
// The page runs in a sandboxed renderer and reaches this file only through the small
// bridge in preload.cjs.
//
// Plain CommonJS on purpose: package.json is "type": "module" for Vite, and a .cjs
// file is the simplest thing Electron can load without a build step.

const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log/main');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

// Everything the main process logs goes to %APPDATA%\Synthonie\logs\main.log, so when
// something goes wrong on his PC the log can be sent over. The updater logs there too.
log.transports.file.level = 'info';
carryOverUserData('Zeke Synth'); // before the first log line creates the new folder
log.info(`Synthonie ${app.getVersion()} starting (${app.isPackaged ? 'installed' : 'dev'})`);

/**
 * v0.1 shipped as "Zeke Synth", and Electron keeps the autosave (IndexedDB) under
 * %APPDATA%\<product name>. The first time Synthonie runs on a PC that has the old folder,
 * copy it over so nothing autosaved there looks lost. Skipped once Synthonie has data of
 * its own; the old folder is left alone.
 */
function carryOverUserData(oldProductName) {
  const newDir = app.getPath('userData');
  const oldDir = path.join(path.dirname(newDir), oldProductName);
  const marker = 'IndexedDB';
  if (fsSync.existsSync(path.join(newDir, marker)) || !fsSync.existsSync(path.join(oldDir, marker))) return;
  try {
    fsSync.cpSync(oldDir, newDir, { recursive: true, force: false, errorOnExist: false });
    log.info(`carried the autosave over from ${oldDir}`);
  } catch (e) {
    log.warn(`could not carry the autosave over from ${oldDir}: ${e.message}`);
  }
}

const APP_ID = 'com.davecoles.synthonie'; // must match "appId" in package.json
const BACKGROUND = '#13151b'; // --bg in src/styles.css, so the window never flashes white

// scripts/desktop-dev.mjs sets this to the Vite dev server so edits hot-reload in the
// window. When it is unset we load the built files from dist/.
const DEV_URL = process.env.SYNTHONIE_DEV_URL;

/** Paths a dialog handed out this session. The renderer may only write to these. */
const writablePaths = new Set();
/** Where the last dialog ended up, so the next one opens in the same folder. */
let lastDir;

// One running copy only: a second double-click just focuses the first window (and opens
// the project it was given), otherwise two copies would fight over the same autosave.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    openProjectPath(projectPathIn(argv, workingDirectory));
  });
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
  app.whenReady().then(() => {
    allowMicrophoneOnly();
    registerFileBridge();
    createWindow();
    openProjectPath(projectPathIn(process.argv, process.cwd()));
    setupAutoUpdate();
  });
  app.on('window-all-closed', () => app.quit());
}

// Updates come from the GitHub Releases of the repo named under "build.publish" in
// package.json (electron-builder writes that into resources/app-update.yml at package
// time). The app checks shortly after launch and every few hours, downloads a newer
// installer in the background, then offers a restart; declining installs it on quit.
const UPDATE_CHECK_DELAY_MS = 8 * 1000;
const UPDATE_CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

function setupAutoUpdate() {
  if (!app.isPackaged) {
    log.info('auto-update: skipped (not an installed build)');
    return;
  }
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => log.info(`auto-update: ${info.version} available, downloading`));
  autoUpdater.on('update-not-available', () => log.info('auto-update: up to date'));
  // electron-updater's errors carry the whole HTTP response; the first line says enough.
  autoUpdater.on('error', (err) => log.warn(`auto-update: ${String(err?.message ?? err).split('\n')[0]}`));
  autoUpdater.on('update-downloaded', async (info) => {
    const [win] = BrowserWindow.getAllWindows();
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update ready',
      message: `Synthonie ${info.version} is ready to install.`,
      detail: 'Your work is autosaved, so restarting is safe. If you pick Later, it installs the next time you close the app.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // A failed check (offline, no release yet) is already reported by the 'error' event above.
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, UPDATE_CHECK_DELAY_MS);
  setInterval(check, UPDATE_CHECK_EVERY_MS);
}

function createWindow() {
  Menu.setApplicationMenu(null); // the app is one screen; no menu bar
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: BACKGROUND,
    title: 'Synthonie',
    // Packaged builds use the icon baked into the .exe; this is for `npm run desktop`.
    icon: app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // No menu means no built-in shortcuts, so keep the two useful ones.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      win.webContents.reload();
      event.preventDefault();
    }
  });

  // The window only ever shows the app. Links open in the normal browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

/** getUserMedia for audio is the only permission the app needs; everything else is refused. */
function allowMicrophoneOnly() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const types = details.mediaTypes ?? [];
    callback(permission === 'media' && !types.includes('video'));
  });
  ses.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
    return permission === 'media' && details.mediaType !== 'video';
  });
}

/**
 * The file bridge behind window.synthonieDesktop (see preload.cjs; the renderer-side types are
 * in src/files/desktop.ts). Dialogs run here because only the main process can show them.
 */
function registerFileBridge() {
  const filters = (filter) => [filter, { name: 'All files', extensions: ['*'] }];
  const startDir = () => lastDir ?? app.getPath('documents');

  ipcMain.handle('synthonie:save-dialog', async (event, { suggestedName, filter }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: path.join(startDir(), suggestedName),
      filters: filters(filter),
    });
    if (canceled || !filePath) return undefined;
    lastDir = path.dirname(filePath);
    writablePaths.add(filePath);
    return filePath;
  });

  ipcMain.handle('synthonie:open-files', async (event, { filter, multiple }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      defaultPath: startDir(),
      filters: filters(filter),
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    });
    if (canceled || !filePaths.length) return [];
    lastDir = path.dirname(filePaths[0]);
    for (const p of filePaths) writablePaths.add(p); // so Save can overwrite an opened project
    return Promise.all(filePaths.map(async (p) => ({ path: p, name: path.basename(p), bytes: await fs.readFile(p) })));
  });

  ipcMain.handle('synthonie:write-file', async (_event, filePath, bytes) => {
    if (typeof filePath !== 'string' || !writablePaths.has(filePath)) {
      throw new Error('Can only write to a file chosen in a Save or Open dialog.');
    }
    await fs.writeFile(filePath, bytes);
  });

  // The page sends this once it has booted and can load a project (see onOpenProject in
  // preload.cjs). Anything that arrived before then is handed over now.
  ipcMain.on('synthonie:open-project-ready', (event) => {
    projectListener = event.sender;
    const waiting = pendingProject;
    pendingProject = undefined;
    openProjectPath(waiting);
  });
}

// Opening a project by double-clicking it in Explorer (the installer registers .synthonie)
// or by passing it on the command line. Windows starts the app with the file as an
// argument: at first launch that is process.argv; while the app is running, the
// single-instance lock turns it into the 'second-instance' event above.

/** The page that is listening for projects (set once it has booted) and a file waiting for it. */
let projectListener;
let pendingProject;

/** The project file in a command line (.synthonie, or .zekeproj from v0.1), as an absolute path, or undefined. */
function projectPathIn(argv, cwd) {
  const file = argv.find((arg) => !arg.startsWith('-') && /\.(synthonie|zekeproj)$/i.test(arg));
  return file ? path.resolve(cwd, file) : undefined;
}

/** Read the project here (the page is sandboxed) and send it to the page, or hold it until the page is ready. */
async function openProjectPath(filePath) {
  if (!filePath) return;
  if (!projectListener || projectListener.isDestroyed()) {
    pendingProject = filePath;
    return;
  }
  try {
    const bytes = await fs.readFile(filePath);
    writablePaths.add(filePath); // so Save can overwrite it, just like a file from the Open dialog
    lastDir = path.dirname(filePath);
    projectListener.send('synthonie:open-project', { path: filePath, name: path.basename(filePath), bytes });
  } catch (e) {
    dialog.showErrorBox('Could not open project', `${filePath}\n${e.message}`);
  }
}
