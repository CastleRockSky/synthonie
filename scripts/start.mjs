// One-click launcher: builds the app if the source is newer than the last build,
// serves it on http://localhost:4173 and opens it in an Edge "app" window (no tabs,
// no address bar). Close this console window to stop it.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const url = `http://localhost:${PORT}/`;

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    const m = entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs;
    if (m > newest) newest = m;
  }
  return newest;
}

function needsBuild() {
  const built = path.join(root, 'dist', 'index.html');
  if (!existsSync(built) || process.argv.includes('--build')) return true;
  const builtAt = statSync(built).mtimeMs;
  const sources = [path.join(root, 'src'), path.join(root, 'index.html'), path.join(root, 'package.json')];
  return sources.some((s) => existsSync(s) && (statSync(s).isDirectory() ? newestMtime(s) : statSync(s).mtimeMs) > builtAt);
}

function openBrowser() {
  if (process.platform === 'win32') {
    const candidates = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA]
      .filter(Boolean)
      .map((base) => path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    const edge = candidates.find((p) => existsSync(p));
    if (edge) {
      spawn(edge, [`--app=${url}`], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

const { build, preview } = await import('vite');

if (needsBuild()) {
  console.log('Building Zeke Synth (first run or the code changed)…');
  await build({ root, logLevel: 'warn' });
}

await preview({ root, preview: { port: PORT, strictPort: true, host: '127.0.0.1' } });
console.log(`Zeke Synth is running at ${url}`);
console.log('Keep this window open while you use it. Close it to stop.');
openBrowser();
