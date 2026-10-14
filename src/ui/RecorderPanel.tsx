import { useEffect, useRef, useState } from 'react';
import * as actions from '../app/actions';
import { getAudioContext, unlockAudio } from '../audio/context';
import { applyEdgeFades, computePeaks, trimSilence } from '../audio/dsp';
import { MicRecorder, type Take } from '../audio/recorder';
import { copyChannel } from '../audio/wav';
import { Modal } from './controls';
import { Waveform } from './Waveform';

const MAX_SECONDS = 120;

type Phase = 'idle' | 'recording' | 'review' | 'error';

export function RecorderPanel({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [voiceMode, setVoiceMode] = useState(false);
  const [trim, setTrim] = useState(true);
  const [name, setName] = useState('My sound');
  const [error, setError] = useState('');
  const [peaks, setPeaks] = useState<Float32Array>();
  const recRef = useRef<MicRecorder | null>(null);
  const takeRef = useRef<Take | null>(null);
  const previewRef = useRef<AudioBufferSourceNode | null>(null);

  const stop = async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    const take = await rec.stop();
    takeRef.current = take;
    setPeaks(computePeaks([take.samples], 160));
    setPhase(take.samples.length ? 'review' : 'idle');
  };

  const start = async () => {
    setError('');
    try {
      const rec = new MicRecorder(getAudioContext());
      rec.onLevel = setLevel;
      recRef.current = rec;
      await rec.start({ voiceMode });
      setSeconds(0);
      setPhase('recording');
    } catch (e) {
      recRef.current = null;
      const err = e as DOMException;
      setError(
        err?.name === 'NotAllowedError'
          ? 'The browser blocked the microphone. Click the camera/microphone icon in the address bar to allow it, then try again.'
          : err?.name === 'NotFoundError'
            ? 'No microphone found. Plug one in and try again.'
            : err?.message || String(e),
      );
      setPhase('error');
    }
  };

  // Tick the timer while recording; auto-stop at the limit.
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = window.setInterval(() => {
      const rec = recRef.current;
      if (!rec) return;
      setSeconds(rec.seconds);
      if (rec.seconds >= MAX_SECONDS) void stop();
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Always release the microphone if the panel unmounts.
  useEffect(
    () => () => {
      recRef.current?.cancel();
      previewRef.current?.stop();
    },
    [],
  );

  const processed = (): Take => {
    const take = takeRef.current;
    if (!take) return { samples: new Float32Array(0), sampleRate: 48000 };
    let s = trim ? trimSilence(take.samples, take.sampleRate) : take.samples;
    s = applyEdgeFades(s.slice(), take.sampleRate);
    return { samples: s, sampleRate: take.sampleRate };
  };

  const preview = async () => {
    const ctx = await unlockAudio();
    previewRef.current?.stop();
    const { samples, sampleRate } = processed();
    if (!samples.length) return;
    const buf = ctx.createBuffer(1, samples.length, sampleRate);
    copyChannel(buf, samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    previewRef.current = src;
  };

  const save = async () => {
    const { samples, sampleRate } = processed();
    if (!samples.length) return;
    await actions.addRecording(samples, sampleRate, name.trim() || 'My sound');
    onClose();
  };

  const cancelAll = () => {
    recRef.current?.cancel();
    previewRef.current?.stop();
    onClose();
  };

  const supported = MicRecorder.isSupported();
  const processedLength = phase === 'review' ? processed().samples.length / (takeRef.current?.sampleRate ?? 48000) : 0;

  return (
    <Modal title="🎤 Record a sound" onClose={cancelAll} width={540}>
      {!supported && <p className="error">This browser cannot record. Use Edge or Chrome.</p>}

      {phase === 'idle' && supported && (
        <div className="stack">
          <p>Make a noise: a roar, a door creak, tapping a cup, anything. Up to {MAX_SECONDS} seconds.</p>
          <label className="check">
            <input type="checkbox" checked={voiceMode} onChange={(e) => setVoiceMode(e.target.checked)} /> Voice mode (cleans up background noise; better for talking, worse for effects)
          </label>
          <button className="primary big" onClick={() => void start()}>
            ● Start recording
          </button>
        </div>
      )}

      {phase === 'recording' && (
        <div className="stack">
          <div className="rec-status">
            <span className="rec-dot" /> Recording… {seconds.toFixed(1)} s
          </div>
          <div className="meter">
            <div className="meter-fill" style={{ width: `${Math.min(100, level * 140)}%` }} />
          </div>
          <button className="primary big" onClick={() => void stop()}>
            ■ Stop
          </button>
        </div>
      )}

      {phase === 'review' && (
        <div className="stack">
          <Waveform peaks={peaks} height={60} color="#ff9f5a" />
          <label className="check">
            <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} /> Trim silence from the start and end ({processedLength.toFixed(1)} s)
          </label>
          <label className="field">
            Name <input value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
          </label>
          <div className="row end">
            <button onClick={() => void preview()}>▶ Listen</button>
            <button onClick={() => setPhase('idle')}>↺ Try again</button>
            <button className="primary" onClick={() => void save()}>
              Save to library
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="stack">
          <p className="error">{error}</p>
          <button onClick={() => setPhase('idle')}>Back</button>
        </div>
      )}
    </Modal>
  );
}
