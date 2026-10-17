// Runs the desktop shell against the Vite dev server, so edits hot-reload inside the
// Electron window. `npm run dev` stays the plain browser workflow; this is `npm run desktop`.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Any free port: a plain `npm run dev` may already hold 5173.
const server = await createServer({ root, server: { port: 5173, strictPort: false }, logLevel: 'warn' });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('Vite did not report a local URL');
console.log(`Synthonie desktop shell, hot-reloading from ${url}`);

const child = spawn(electron, ['.'], { cwd: root, stdio: 'inherit', env: { ...process.env, SYNTHONIE_DEV_URL: url } });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
