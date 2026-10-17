// The .synthonie format: a zip with project.json plus sounds/<id>.<ext> for file sounds.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { SoundBank, StoredBytes } from '../audio/bank';
import type { Project, SoundId } from '../model/types';

export function packProject(project: Project, bank: SoundBank): Uint8Array {
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    'project.json': [strToU8(JSON.stringify(project, null, 2)), { level: 6 }],
  };
  for (const s of project.sounds) {
    if (s.kind !== 'file') continue;
    const rec = bank.bytes.get(s.id);
    if (!rec) continue;
    // WAV compresses well; mp3/ogg are already compressed so store them as-is.
    files[`sounds/${s.id}.${rec.ext}`] = [rec.bytes, { level: rec.ext === 'wav' ? 6 : 0 }];
  }
  return zipSync(files);
}

export interface UnpackedProject {
  project: Project;
  sounds: Map<SoundId, StoredBytes>;
}

export function unpackProject(bytes: Uint8Array): UnpackedProject {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('That is not a Synthonie project file.');
  }
  const json = files['project.json'];
  if (!json) throw new Error('Not a Synthonie project (no project.json inside).');
  const project = migrate(JSON.parse(strFromU8(json)));
  const sounds = new Map<SoundId, StoredBytes>();
  for (const [path, data] of Object.entries(files)) {
    const m = /^sounds\/(.+)\.([a-z0-9]+)$/i.exec(path);
    if (m) sounds.set(m[1], { bytes: data, ext: m[2].toLowerCase() });
  }
  return { project, sounds };
}

/** Upgrade older project files here as the format evolves (version 1 is the first). */
export function migrate(raw: unknown): Project {
  const p = raw as Partial<Project> | null;
  if (!p || typeof p !== 'object' || !Array.isArray(p.sounds) || !p.pattern) throw new Error('The project file is damaged.');
  if (p.version !== 1) throw new Error(`This project was made with a newer version of the app (v${String(p.version)}).`);
  return p as Project;
}
