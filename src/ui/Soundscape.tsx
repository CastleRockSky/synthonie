import { useStore } from '../model/store';
import type { Layer, LayerMode } from '../model/types';
import { Slider, Toggle, panFmt, pct, pitchFmt } from './controls';

export function Soundscape() {
  const layers = useStore((s) => s.project.layers);
  const enabled = useStore((s) => s.project.sceneEnabled);
  const setEnabled = useStore((s) => s.setSceneEnabled);

  return (
    <section className="panel scene">
      <header className="panel-head">
        <h2>🌲 Soundscape</h2>
        <Toggle on={enabled} onChange={setEnabled} label={enabled ? 'On' : 'Off'} title="Switch the whole soundscape on or off" />
        <p className="hint">Stack sounds to build a place. Loop plays forever; Random plays now and then.</p>
      </header>
      {layers.length === 0 && (
        <div className="empty">
          Pick a sound on the left and press <b>+ Scene</b>.
        </div>
      )}
      <div className="layers">
        {layers.map((l) => (
          <LayerCard key={l.id} layer={l} />
        ))}
      </div>
    </section>
  );
}

function LayerCard({ layer }: { layer: Layer }) {
  const sounds = useStore((s) => s.project.sounds);
  const updateLayer = useStore((s) => s.updateLayer);
  const removeLayer = useStore((s) => s.removeLayer);
  const sound = sounds.find((s) => s.id === layer.soundId);
  const set = (patch: Partial<Layer>) => updateLayer(layer.id, patch);
  const num = (raw: string) => Math.max(0.1, Number(raw) || 0.1);

  return (
    <div className={'layer-card' + (layer.muted ? ' muted' : '')}>
      <div className="layer-head">
        <span className="sound-icon big">{sound?.icon ?? '❓'}</span>
        <select value={layer.soundId} onChange={(e) => set({ soundId: e.target.value })} title="Which sound this layer plays">
          {sounds.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon} {s.name}
            </option>
          ))}
        </select>
        <select value={layer.mode} onChange={(e) => set({ mode: e.target.value as LayerMode })} title="How it plays">
          <option value="loop">Loop forever</option>
          <option value="once">Play once</option>
          <option value="random">Random</option>
        </select>
        {layer.mode === 'random' && (
          <span className="random-opts">
            every
            <input type="number" min={0.1} step={0.5} value={layer.randomMin} onChange={(e) => set({ randomMin: num(e.target.value) })} />
            to
            <input type="number" min={0.1} step={0.5} value={layer.randomMax} onChange={(e) => set({ randomMax: num(e.target.value) })} />
            seconds
          </span>
        )}
        <span className="spacer" />
        <Toggle on={layer.muted} onChange={(muted) => set({ muted })} label={layer.muted ? '🔇 Muted' : '🔊 On'} title="Mute this layer" />
        <button className="icon-btn danger" onClick={() => removeLayer(layer.id)} title="Remove layer">
          ✕
        </button>
      </div>
      <div className="layer-sliders">
        <Slider label="Volume" value={layer.volume} min={0} max={1} onChange={(v) => set({ volume: v })} format={pct} reset={0.8} />
        <Slider label="Left / Right" value={layer.pan} min={-1} max={1} onChange={(v) => set({ pan: v })} format={panFmt} reset={0} />
        <Slider
          label="Pitch"
          value={layer.pitch}
          min={0.5}
          max={2}
          onChange={(v) => set({ pitch: v })}
          format={pitchFmt}
          title="Playback speed: lower is deeper and slower"
          reset={1}
        />
        <Slider
          label="Muffle"
          value={1 - layer.muffle}
          min={0}
          max={1}
          onChange={(v) => set({ muffle: 1 - v })}
          format={pct}
          title="Low-pass filter: turn up to sound far away or behind a wall"
          reset={0}
        />
        <Slider label="Space" value={layer.space} min={0} max={1} onChange={(v) => set({ space: v })} format={pct} title="Reverb send: how much room you hear" reset={0.2} />
        {layer.mode === 'random' && (
          <Slider
            label="Vary pitch"
            value={layer.randomPitch}
            min={0}
            max={1}
            onChange={(v) => set({ randomPitch: v })}
            format={pct}
            title="Each play gets a slightly different pitch"
            reset={0.2}
          />
        )}
      </div>
    </div>
  );
}
