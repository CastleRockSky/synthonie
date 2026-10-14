import { useEffect, useRef, useState } from 'react';
import { engine } from '../app/instances';
import { NOTE_NAMES, SCALES, midiToName, rowToMidi } from '../audio/scales';
import { INSTRUMENTS, INSTRUMENT_LIST } from '../audio/synth';
import { useStore } from '../model/store';
import type { InstrumentId, Pattern, ScaleId } from '../model/types';
import { Slider, Toggle, pct } from './controls';

export function BeatMaker() {
  const pattern = useStore((s) => s.project.pattern);
  const enabled = useStore((s) => s.project.beatEnabled);
  const setEnabled = useStore((s) => s.setBeatEnabled);
  const updatePattern = useStore((s) => s.updatePattern);
  const playing = useStore((s) => s.playing);
  const [playStep, setPlayStep] = useState(-1);

  // Follow the engine's playhead with requestAnimationFrame while playing.
  useEffect(() => {
    if (!playing) {
      setPlayStep(-1);
      return;
    }
    let raf = 0;
    let last = -1;
    const loop = () => {
      const s = engine.currentStep();
      if (s !== last) {
        last = s;
        setPlayStep(s);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <section className="panel beat">
      <header className="panel-head">
        <h2>🥁 Beat Maker</h2>
        <Toggle on={enabled} onChange={setEnabled} label={enabled ? 'On' : 'Off'} title="Switch the beat on or off" />
        <p className="hint">Click squares to make a beat. Tune squares next to each other join into one long note.</p>
      </header>
      <div className="beat-controls">
        <Slider label="Tempo" value={pattern.bpm} min={60} max={200} step={1} onChange={(v) => updatePattern({ bpm: v })} format={(v) => `${v} bpm`} reset={100} />
        <label className="field">
          Steps
          <select value={pattern.steps} onChange={(e) => updatePattern({ steps: Number(e.target.value) as 16 | 32 })}>
            <option value={16}>16</option>
            <option value={32}>32</option>
          </select>
        </label>
        <Slider label="Swing" value={pattern.swing} min={0} max={1} onChange={(v) => updatePattern({ swing: v })} format={pct} title="Pushes every other step late for a bouncy feel" reset={0} />
        <Slider label="Volume" value={pattern.volume} min={0} max={1} onChange={(v) => updatePattern({ volume: v })} format={pct} reset={0.8} />
        <Slider label="Space" value={pattern.space} min={0} max={1} onChange={(v) => updatePattern({ space: v })} format={pct} title="Reverb send for the whole beat" reset={0.25} />
      </div>
      <DrumGrid pattern={pattern} playStep={playStep} />
      <MelodyGrid pattern={pattern} playStep={playStep} />
    </section>
  );
}

/** Tracks mouse-drag painting across grid cells: press sets the value, drag spreads it. */
function usePaint() {
  const paint = useRef<boolean | null>(null);
  useEffect(() => {
    const up = () => {
      paint.current = null;
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  return paint;
}

function cellClass(on: boolean, i: number, playStep: number, extra = '') {
  return 'cell' + (on ? ' on' : '') + (i === playStep ? ' now' : '') + (i % 4 === 0 ? ' beat' : '') + extra;
}

function DrumGrid({ pattern, playStep }: { pattern: Pattern; playStep: number }) {
  const sounds = useStore((s) => s.project.sounds);
  const setDrumStep = useStore((s) => s.setDrumStep);
  const updateDrumRow = useStore((s) => s.updateDrumRow);
  const removeDrumRow = useStore((s) => s.removeDrumRow);
  const addDrumRow = useStore((s) => s.addDrumRow);
  const paint = usePaint();

  const addDefault = () => {
    const used = new Set(pattern.drums.map((d) => d.soundId));
    const drum = sounds.find((s) => s.category === 'drums' && !used.has(s.id)) ?? sounds.find((s) => s.category === 'drums') ?? sounds[0];
    if (drum) addDrumRow(drum.id);
  };

  return (
    <div className="grid-block">
      <div className="grid-title">
        <h3>Drums</h3>
        <button onClick={addDefault}>+ Add drum</button>
      </div>
      {pattern.drums.map((row) => (
        <div key={row.id} className={'grid-row' + (row.muted ? ' muted' : '')}>
          <div className="row-head">
            <select value={row.soundId} onChange={(e) => updateDrumRow(row.id, { soundId: e.target.value })} title="Which sound this row hits">
              {sounds.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
            <input type="range" className="mini" min={0} max={1} step={0.01} value={row.volume} onChange={(e) => updateDrumRow(row.id, { volume: Number(e.target.value) })} title={`Volume ${pct(row.volume)}`} />
            <input type="range" className="mini" min={0.5} max={2} step={0.01} value={row.pitch} onChange={(e) => updateDrumRow(row.id, { pitch: Number(e.target.value) })} title={`Pitch ${row.pitch.toFixed(2)}×`} />
            <button className={'icon-btn' + (row.muted ? ' on' : '')} onClick={() => updateDrumRow(row.id, { muted: !row.muted })} title="Mute row">
              {row.muted ? '🔇' : '🔊'}
            </button>
            <button className="icon-btn danger" onClick={() => removeDrumRow(row.id)} title="Remove row">
              ✕
            </button>
          </div>
          <div className="cells" style={{ gridTemplateColumns: `repeat(${pattern.steps}, 1fr)` }}>
            {row.steps.map((on, i) => (
              <button
                key={i}
                className={cellClass(on, i, playStep)}
                onMouseDown={() => {
                  paint.current = !on;
                  setDrumStep(row.id, i, !on);
                  if (!on) void engine.preview(row.soundId);
                }}
                onMouseEnter={() => {
                  if (paint.current !== null) setDrumStep(row.id, i, paint.current);
                }}
                aria-label={`step ${i + 1}`}
              />
            ))}
          </div>
        </div>
      ))}
      {pattern.drums.length === 0 && (
        <div className="empty">
          Press <b>+ Add drum</b>, or pick a sound on the left and press <b>+ Beat</b>.
        </div>
      )}
    </div>
  );
}

function MelodyGrid({ pattern, playStep }: { pattern: Pattern; playStep: number }) {
  const m = pattern.melody;
  const setMelodyCell = useStore((s) => s.setMelodyCell);
  const updateMelody = useStore((s) => s.updateMelody);
  const updatePattern = useStore((s) => s.updatePattern);
  const clearMelody = useStore((s) => s.clearMelody);
  const paint = usePaint();

  const midiOfRow = (r: number) => rowToMidi(pattern.rows - 1 - r, pattern.scale, pattern.root, pattern.octave);
  const inst = INSTRUMENTS[m.instrument];

  return (
    <div className="grid-block">
      <div className="grid-title">
        <h3>Tune</h3>
        <select value={m.instrument} onChange={(e) => updateMelody({ instrument: e.target.value as InstrumentId })} title="Instrument">
          {INSTRUMENT_LIST.map((i) => (
            <option key={i.id} value={i.id}>
              {i.icon} {i.name}
            </option>
          ))}
        </select>
        <select value={pattern.scale} onChange={(e) => updatePattern({ scale: e.target.value as ScaleId })} title="Which notes the rows use">
          {(Object.keys(SCALES) as ScaleId[]).map((id) => (
            <option key={id} value={id}>
              {SCALES[id].name}
            </option>
          ))}
        </select>
        <select value={pattern.root} onChange={(e) => updatePattern({ root: Number(e.target.value) })} title="Key">
          {NOTE_NAMES.map((n, i) => (
            <option key={n} value={i}>
              Key of {n}
            </option>
          ))}
        </select>
        <select value={pattern.octave} onChange={(e) => updatePattern({ octave: Number(e.target.value) })} title="How high or low the grid is">
          <option value={2}>Low</option>
          <option value={3}>Mid</option>
          <option value={4}>High</option>
        </select>
        <input type="range" className="mini" min={0} max={1} step={0.01} value={m.volume} onChange={(e) => updateMelody({ volume: Number(e.target.value) })} title={`Volume ${pct(m.volume)}`} />
        <button className={'icon-btn' + (m.muted ? ' on' : '')} onClick={() => updateMelody({ muted: !m.muted })} title="Mute the tune">
          {m.muted ? '🔇' : '🔊'}
        </button>
        <button onClick={clearMelody} title="Wipe all the tune squares">
          Clear
        </button>
      </div>
      <div className="melody">
        {m.cells.map((cells, r) => (
          <div key={r} className="grid-row">
            <div className="note-name">{midiToName(midiOfRow(r))}</div>
            <div className="cells" style={{ gridTemplateColumns: `repeat(${pattern.steps}, 1fr)` }}>
              {cells.map((on, i) => (
                <button
                  key={i}
                  className={cellClass(on, i, playStep, ' note' + (on && cells[i + 1] ? ' joined' : ''))}
                  onMouseDown={() => {
                    paint.current = !on;
                    setMelodyCell(r, i, !on);
                    if (!on) void engine.previewNote(inst, midiOfRow(r));
                  }}
                  onMouseEnter={() => {
                    if (paint.current !== null) setMelodyCell(r, i, paint.current);
                  }}
                  aria-label={`${midiToName(midiOfRow(r))} step ${i + 1}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
