import { useState } from 'react';
import * as actions from '../app/actions';
import { useStore } from '../model/store';
import { Modal } from './controls';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const loop = actions.loopSeconds(project);
  const beat = actions.hasBeatContent(project);
  const [seconds, setSeconds] = useState(() => (beat ? round(loop * 4) : 30));
  const [seamless, setSeamless] = useState(true);
  const [fade, setFade] = useState(beat ? 0.5 : 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const saved = await actions.exportWav({ seconds, crossfade: seamless ? Math.min(fade, seconds / 2) : 0 });
      if (saved) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export a WAV file" onClose={onClose} width={520}>
      <div className="stack">
        <p>Makes a stereo .wav of everything that is switched on, ready to drop into your game.</p>
        <div className="row wrap">
          <label className="field">
            Length
            <input type="number" min={0.5} max={600} step={0.5} value={seconds} onChange={(e) => setSeconds(Math.max(0.5, Number(e.target.value) || 0.5))} />
            s
          </label>
          <button onClick={() => setSeconds(round(loop))}>1 loop</button>
          <button onClick={() => setSeconds(round(loop * 4))}>4 loops</button>
          <button onClick={() => setSeconds(30)}>30 s</button>
          <button onClick={() => setSeconds(60)}>1 min</button>
        </div>
        <label className="check">
          <input type="checkbox" checked={seamless} onChange={(e) => setSeamless(e.target.checked)} /> Seamless loop (blend the end into the start so it repeats without a gap)
        </label>
        {seamless && (
          <label className="field">
            Blend
            <input type="number" min={0.05} max={10} step={0.05} value={fade} onChange={(e) => setFade(Math.max(0.05, Number(e.target.value) || 0.05))} />
            s
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row end">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={() => void run()}>
            {busy ? 'Rendering…' : 'Export'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
