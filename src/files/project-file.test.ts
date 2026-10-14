import { describe, expect, it } from 'vitest';
import { SoundBank } from '../audio/bank';
import { newProject } from '../model/defaults';
import { packProject, unpackProject } from './project-file';

describe('project file', () => {
  it('round-trips the project document and file sounds through the zip', () => {
    const bank = new SoundBank();
    const project = newProject();
    const bytes = Uint8Array.from([1, 2, 3, 4, 5]);
    bank.bytes.set('snd_abc', { bytes, ext: 'mp3' });
    project.sounds.push({ id: 'snd_abc', name: 'Roar', icon: '🎤', kind: 'file', category: 'mine', ext: 'mp3' });
    project.name = 'Dungeon';

    const zip = packProject(project, bank);
    const back = unpackProject(zip);

    expect(back.project.name).toBe('Dungeon');
    expect(back.project.layers.length).toBe(project.layers.length);
    expect(back.project.sounds.find((s) => s.id === 'snd_abc')?.name).toBe('Roar');
    expect(Array.from(back.sounds.get('snd_abc')?.bytes ?? [])).toEqual([1, 2, 3, 4, 5]);
    expect(back.sounds.get('snd_abc')?.ext).toBe('mp3');
  });

  it('rejects files that are not projects', () => {
    expect(() => unpackProject(Uint8Array.from([0, 1, 2]))).toThrow();
  });
});
