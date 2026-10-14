import { useState, type DragEvent } from 'react';
import * as actions from '../app/actions';
import { bank, engine } from '../app/instances';
import { BUILTIN_BY_ID } from '../audio/builtins';
import { useStore, type Tab } from '../model/store';
import type { SoundCategory, SoundMeta } from '../model/types';
import { Waveform } from './Waveform';

const CATEGORY_LABELS: Record<SoundCategory, string> = {
  mine: 'My sounds',
  ambience: 'Ambience (loops)',
  nature: 'Nature (one-shots)',
  drums: 'Drums',
  fx: 'Game effects',
};
const ORDER: SoundCategory[] = ['mine', 'ambience', 'nature', 'drums', 'fx'];

export function SoundLibrary({ onRecord }: { onRecord: () => void }) {
  const sounds = useStore((s) => s.project.sounds);
  const tab = useStore((s) => s.tab);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void actions.importAudioFiles(files);
  };

  return (
    <aside
      className={'library' + (dragOver ? ' drag' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="library-head">
        <h2>Sounds</h2>
        <div className="row">
          <button onClick={() => void actions.importAudio()} title="Add WAV, MP3 or OGG files">
            ⬆ Import
          </button>
          <button className="rec" onClick={onRecord} title="Record with the microphone">
            ● Record
          </button>
        </div>
        <p className="hint">You can also drop audio files here.</p>
      </div>
      <div className="library-list">
        {ORDER.map((cat) => {
          const list = sounds.filter((s) => s.category === cat);
          if (!list.length) return null;
          return (
            <section key={cat}>
              <h3>{CATEGORY_LABELS[cat]}</h3>
              {list.map((s) => (
                <SoundCard key={s.id} sound={s} tab={tab} />
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function SoundCard({ sound, tab }: { sound: SoundMeta; tab: Tab }) {
  const renameSound = useStore((s) => s.renameSound);
  const addLayer = useStore((s) => s.addLayer);
  const addDrumRow = useStore((s) => s.addDrumRow);
  const [editing, setEditing] = useState(false);

  const peaks = bank.peaks(sound.id);
  const duration = bank.duration(sound.id);
  const isLoop = sound.kind === 'builtin' ? (BUILTIN_BY_ID.get(sound.builtinId ?? '')?.loop ?? false) : duration > 4;

  const commitName = (raw: string) => {
    const name = raw.trim();
    if (name && name !== sound.name) renameSound(sound.id, name);
    setEditing(false);
  };

  return (
    <div className="sound-card">
      <div className="sound-main">
        <span className="sound-icon">{sound.icon}</span>
        {editing ? (
          <input
            className="sound-rename"
            autoFocus
            defaultValue={sound.name}
            onBlur={(e) => commitName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button className="sound-name" title="Click to rename" onClick={() => setEditing(true)}>
            {sound.name}
          </button>
        )}
        <span className="sound-dur">{duration.toFixed(1)}s</span>
      </div>
      <Waveform peaks={peaks} />
      <div className="sound-actions">
        <button onClick={() => void engine.preview(sound.id)} title="Listen">
          ▶
        </button>
        <button className={tab === 'scene' ? 'primary' : ''} onClick={() => addLayer(sound.id, isLoop)} title="Add to the Soundscape">
          + Scene
        </button>
        <button className={tab === 'beat' ? 'primary' : ''} onClick={() => addDrumRow(sound.id)} title="Add as a drum row in the Beat Maker">
          + Beat
        </button>
        {sound.kind === 'file' && (
          <button
            className="icon-btn danger"
            title="Delete this sound"
            onClick={() => {
              if (window.confirm(`Delete "${sound.name}"? Layers and drums using it will be removed too.`)) void actions.removeSound(sound.id);
            }}
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}
