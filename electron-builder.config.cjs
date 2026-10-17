// electron-builder configuration (it used to be the "build" field in package.json).
// It is a JS file so one machine-dependent setting can be decided at build time: reuse the
// Electron binary that `npm install` already downloaded when it is there (fast local builds),
// otherwise let electron-builder fetch Electron itself (CI runners, where dependency install
// scripts may be skipped and node_modules/electron/dist never appears).

const { existsSync } = require('node:fs');
const path = require('node:path');

const localElectron = path.join(__dirname, 'node_modules', 'electron', 'dist');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.davecoles.synthonie',
  productName: 'Synthonie',
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  ...(existsSync(path.join(localElectron, 'electron.exe')) ? { electronDist: localElectron } : {}),
  files: ['dist/**/*', 'electron/**/*'],
  // Where installed copies look for updates (electron-updater reads this from app-update.yml).
  publish: {
    provider: 'github',
    owner: 'CastleRockSky',
    repo: 'synthonie',
    releaseType: 'release',
  },
  win: {
    target: 'nsis',
    icon: 'build/icon.ico',
  },
  fileAssociations: [
    {
      ext: 'synthonie',
      name: 'Synthonie project',
      description: 'Synthonie project',
      role: 'Editor',
      icon: 'icon.ico',
    },
    {
      ext: 'zekeproj',
      name: 'Synthonie project (v0.1 name)',
      description: 'Synthonie project (v0.1 name)',
      role: 'Editor',
      icon: 'icon.ico',
    },
  ],
  nsis: {
    oneClick: true,
    perMachine: false,
    shortcutName: 'Synthonie',
    artifactName: 'Synthonie-Setup-${version}.${ext}',
  },
};
