import * as actions from '../app/actions';
import { engine } from '../app/instances';
import { APP_NAME } from '../model/defaults';
import { useStore } from '../model/store';
import { Slider, pct, secFmt } from './controls';

export function TopBar({ onOpenExport, onOpenHelp }: { onOpenExport: () => void; onOpenHelp: () => void }) {
  const name = useStore((s) => s.project.name);
  const playing = useStore((s) => s.playing);
  const dirty = useStore((s) => s.dirty);
  const fileName = useStore((s) => s.fileName);
  const master = useStore((s) => s.project.master);
  const updateMaster = useStore((s) => s.updateMaster);
  const setName = useStore((s) => s.setName);

  return (
    <header className="topbar">
      <div className="brand" title={fileName ?? 'Not saved to a file yet'}>
        <span className="brand-icon">🎛️</span> {APP_NAME}
      </div>
      <div className="project-name-wrap">
        <input className="project-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
        {dirty && (
          <span className="dirty" title="Unsaved changes">
            ●
          </span>
        )}
      </div>
      <div className="file-actions">
        <button onClick={actions.newProject}>New</button>
        <button onClick={() => void actions.openProject()}>Open</button>
        <button onClick={() => void actions.saveProject(false)}>Save</button>
        <button onClick={() => void actions.saveProject(true)}>Save as</button>
        <button className="primary" onClick={onOpenExport} title="Make an .ogg or .wav file for your game">
          Export
        </button>
        <button className="icon-btn" onClick={onOpenHelp} title="Help">
          ?
        </button>
      </div>
      <div className="transport">
        <button className={'play-btn' + (playing ? ' playing' : '')} onClick={() => engine.toggle()} title="Space bar also works">
          {playing ? '■ Stop' : '▶ Play'}
        </button>
        <Slider label="Master" value={master.volume} min={0} max={1} onChange={(v) => updateMaster({ volume: v })} format={pct} reset={0.9} />
        <Slider
          label="Space size"
          value={master.reverbSize}
          min={0.3}
          max={6}
          step={0.1}
          onChange={(v) => updateMaster({ reverbSize: v })}
          format={secFmt}
          title="How big the room sounds (reverb length)"
          reset={2}
        />
        <Slider
          label="Space amount"
          value={master.reverbMix}
          min={0}
          max={1}
          onChange={(v) => updateMaster({ reverbMix: v })}
          format={pct}
          title="How much of the room you hear (reverb level)"
          reset={0.5}
        />
      </div>
    </header>
  );
}
