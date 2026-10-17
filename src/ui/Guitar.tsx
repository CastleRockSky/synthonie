import { useEffect, useRef, useState } from 'react';
import * as actions from '../app/actions';
import { guitar } from '../app/instances';
import { getAudioContext } from '../audio/context';
import { applyEdgeFades, trimSilence } from '../audio/dsp';
import type { AudioInputInfo, GuitarSource } from '../audio/guitar';
import type { Pitch } from '../audio/pitch';
import { MicRecorder } from '../audio/recorder';
import { desktopBridge } from '../files/desktop';
import { GUITAR_PRESET_NAMES } from '../model/guitar-presets';
import { useStore } from '../model/store';
import type { GuitarRig, PedalKey } from '../model/types';
import { Slider, Toggle, pct } from './controls';

const SOURCE_KEY = 'synthonie.guitarSource';

type SourceChoice = { kind: 'demo' } | { kind: 'system' } | { kind: 'device'; deviceId: string | null; channel: 'left' | 'right' | 'both' };

function rememberedSource(): SourceChoice {
  try {
    const raw = localStorage.getItem(SOURCE_KEY);
    if (raw) return JSON.parse(raw) as SourceChoice;
  } catch {
    /* fall through */
  }
  return { kind: 'demo' };
}

export function Guitar() {
  const rig = useStore((s) => s.project.guitar);
  const updateGuitar = useStore((s) => s.updateGuitar);
  const applyPreset = useStore((s) => s.applyGuitarPreset);
  const [choice, setChoice] = useState<SourceChoice>(rememberedSource);
  const [inputs, setInputs] = useState<AudioInputInfo[]>([]);
  const [running, setRunning] = useState(guitar.running);
  const [error, setError] = useState(guitar.error ?? '');
  const [tunerOn, setTunerOn] = useState(false);

  useEffect(() => {
    guitar.onChange = () => {
      setRunning(guitar.running);
      setError(guitar.error ?? '');
    };
    void guitar.listInputs().then(setInputs);
    return () => {
      guitar.onChange = undefined;
    };
  }, []);

  const remember = (c: SourceChoice) => {
    setChoice(c);
    try {
      localStorage.setItem(SOURCE_KEY, JSON.stringify(c));
    } catch {
      /* fine */
    }
  };

  const toSource = (c: SourceChoice): GuitarSource => c;

  const toggleInput = async () => {
    if (running) {
      guitar.stop();
      return;
    }
    setError('');
    try {
      await guitar.start(toSource(choice));
      // Labels only appear once an input has been opened, so refresh the list now.
      setInputs(await guitar.listInputs());
    } catch {
      /* guitar.error carries the message */
    }
  };

  const pickSourceKind = (value: string) => {
    if (value === 'demo') remember({ kind: 'demo' });
    else if (value === 'system') remember({ kind: 'system' });
    else remember({ kind: 'device', deviceId: value === 'default' ? null : value, channel: choice.kind === 'device' ? choice.channel : 'left' });
    if (running) guitar.stop();
  };

  const sourceValue = choice.kind === 'device' ? (choice.deviceId ?? 'default') : choice.kind;
  const desktop = !!desktopBridge();

  return (
    <section className="panel guitar">
      <header className="panel-head">
        <h2>🎸 Guitar</h2>
        <Toggle on={running} onChange={() => void toggleInput()} label={running ? 'Input on' : 'Input off'} title="Start or stop listening to the input" />
        <p className="hint">Plug in through the interface, pick it below, then stomp on pedals. Or try the demo riff first.</p>
      </header>

      <div className="guitar-input">
        <label className="field">
          Input
          <select value={sourceValue} onChange={(e) => pickSourceKind(e.target.value)}>
            <option value="demo">🎵 Demo riff (no guitar needed)</option>
            <option value="default">🎤 Default input</option>
            {inputs
              .filter((i) => i.deviceId !== 'default')
              .map((i) => (
                <option key={i.deviceId} value={i.deviceId}>
                  🔌 {i.label}
                </option>
              ))}
            <option value="system">🖥️ What the PC is playing{desktop ? '' : ' (browser: share the screen with audio)'}</option>
          </select>
        </label>
        {choice.kind === 'device' && (
          <label className="field">
            Plugged into
            <select
              value={choice.channel}
              onChange={(e) => {
                remember({ ...choice, channel: e.target.value as 'left' | 'right' | 'both' });
                if (running) void toggleInput().then(() => void toggleInput());
              }}
              title="Interfaces send input 1 on the left and input 2 on the right"
            >
              <option value="left">Input 1 (left)</option>
              <option value="right">Input 2 (right)</option>
              <option value="both">Both</option>
            </select>
          </label>
        )}
        <Slider label="Input gain" value={rig.inputGain} min={0} max={1} onChange={(v) => updateGuitar({ inputGain: v })} format={pct} reset={0.5} />
        <LevelMeter running={running} which="input" />
        <Toggle
          on={rig.monitor}
          onChange={(monitor) => updateGuitar({ monitor })}
          label={rig.monitor ? '🔊 Hear it' : '🔇 Silent'}
          title="Play the pedalboard sound through the speakers (always off for PC audio)"
        />
        <Toggle on={tunerOn} onChange={setTunerOn} label="Tuner" title="Shows the note you are playing" />
        <span className="spacer" />
        <TakeRecorder running={running} />
      </div>
      {error && <p className="error">{error}</p>}
      {choice.kind === 'system' && running && (
        <p className="hint">Recording everything the PC plays, including other apps such as Guitar Rig. Monitoring is off so the speakers do not feed back.</p>
      )}
      {tunerOn && <Tuner running={running} />}

      <div className="preset-bar">
        <span className="hint">Presets</span>
        {GUITAR_PRESET_NAMES.map((name) => (
          <button key={name} className={rig.preset === name ? 'primary' : ''} onClick={() => applyPreset(name)}>
            {name}
          </button>
        ))}
        {rig.preset === null && <span className="hint">(edited)</span>}
      </div>

      <Pedalboard rig={rig} />

      <div className="guitar-out">
        <Slider label="Volume" value={rig.volume} min={0} max={1} onChange={(v) => updateGuitar({ volume: v })} format={pct} reset={0.8} />
        <LevelMeter running={running} which="output" />
      </div>
    </section>
  );
}

function Pedalboard({ rig }: { rig: GuitarRig }) {
  const updatePedal = useStore((s) => s.updatePedal);
  const knob = <K extends PedalKey>(key: K, field: keyof GuitarRig[K] & string, label: string, title?: string, reset = 0.5) => (
    <Slider
      key={field}
      label={label}
      value={rig[key][field] as unknown as number}
      min={0}
      max={1}
      onChange={(v) => updatePedal(key, { [field]: v } as Partial<GuitarRig[K]>)}
      format={pct}
      title={title}
      reset={reset}
    />
  );
  const Pedal = ({ id, name, icon, children }: { id: PedalKey; name: string; icon: string; children: React.ReactNode }) => (
    <div className={'pedal' + (rig[id].on ? ' on' : '')}>
      <button className="stomp" onClick={() => updatePedal(id, { on: !rig[id].on } as Partial<GuitarRig[typeof id]>)} aria-pressed={rig[id].on}>
        <span className="pedal-icon">{icon}</span>
        <span className="pedal-name">{name}</span>
        <span className="led" />
      </button>
      <div className="pedal-knobs">{children}</div>
    </div>
  );

  return (
    <div className="pedalboard">
      <Pedal id="gate" name="Gate" icon="🚪">
        {knob('gate', 'threshold', 'Threshold', 'Cuts the hum and hiss between notes. Turn up until the silence is silent.', 0.25)}
      </Pedal>
      <Pedal id="comp" name="Squash" icon="🗜️">
        {knob('comp', 'amount', 'Amount', 'Evens out loud and quiet notes (a compressor).', 0.3)}
      </Pedal>
      <Pedal id="drive" name="Drive" icon="🔥">
        {knob('drive', 'drive', 'Drive', 'From a little grit to full fuzz.')}
        {knob('drive', 'tone', 'Tone', 'Darker to brighter.', 0.6)}
        {knob('drive', 'level', 'Level', undefined, 0.6)}
      </Pedal>
      <Pedal id="amp" name="Amp" icon="🔈">
        {knob('amp', 'gain', 'Gain', 'How hard the amp is pushed.', 0.25)}
        {knob('amp', 'bass', 'Bass')}
        {knob('amp', 'mid', 'Mid')}
        {knob('amp', 'treble', 'Treble')}
        <Toggle on={rig.amp.cab} onChange={(cab) => updatePedal('amp', { cab })} label={rig.amp.cab ? 'Speaker cab on' : 'Speaker cab off'} title="The speaker box sound. Off is fizzy and direct." />
      </Pedal>
      <Pedal id="chorus" name="Chorus" icon="🌊">
        {knob('chorus', 'rate', 'Rate')}
        {knob('chorus', 'depth', 'Depth')}
        {knob('chorus', 'mix', 'Mix')}
      </Pedal>
      <Pedal id="tremolo" name="Tremolo" icon="〰️">
        {knob('tremolo', 'rate', 'Rate')}
        {knob('tremolo', 'depth', 'Depth')}
      </Pedal>
      <Pedal id="delay" name="Delay" icon="⏱️">
        {knob('delay', 'time', 'Time', 'How long until the echo.')}
        {knob('delay', 'feedback', 'Repeats', 'How many echoes.')}
        {knob('delay', 'mix', 'Mix')}
      </Pedal>
      <Pedal id="reverb" name="Reverb" icon="🏛️">
        {knob('reverb', 'size', 'Size', 'Closet to cathedral.')}
        {knob('reverb', 'mix', 'Mix')}
      </Pedal>
    </div>
  );
}

/** A peak meter that follows the engine with requestAnimationFrame, so only it re-renders. */
function LevelMeter({ running, which }: { running: boolean; which: 'input' | 'output' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!running) {
      if (ref.current) ref.current.style.width = '0%';
      return;
    }
    let raf = 0;
    let shown = 0;
    const loop = () => {
      const level = guitar.levels()[which];
      shown = Math.max(level, shown * 0.85); // fall back slowly so the bar is readable
      if (ref.current) {
        ref.current.style.width = `${Math.round(Math.min(1, shown) * 100)}%`;
        ref.current.classList.toggle('hot', shown > 0.9);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, which]);
  return (
    <div className="meter small" title={which === 'input' ? 'Input level: keep it out of the red' : 'Output level'}>
      <div ref={ref} className="meter-fill" />
    </div>
  );
}

function Tuner({ running }: { running: boolean }) {
  const [pitch, setPitch] = useState<Pitch | null>(null);
  useEffect(() => {
    if (!running) {
      setPitch(null);
      return;
    }
    let raf = 0;
    let last: Pitch | null = null;
    let quiet = 0;
    const loop = () => {
      const p = guitar.pitch();
      if (p && p.clarity > 0.8) {
        last = p;
        quiet = 0;
        setPitch(p);
      } else if (++quiet > 20) {
        last = null;
        setPitch(null);
      } else if (last) {
        setPitch(last);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  const cents = pitch?.cents ?? 0;
  const inTune = pitch !== null && Math.abs(cents) <= 5;
  return (
    <div className={'tuner' + (inTune ? ' in-tune' : '')}>
      <div className="tuner-note">{pitch ? pitch.name : '—'}</div>
      <div className="tuner-scale">
        <div className="tuner-needle" style={{ left: `${50 + Math.max(-50, Math.min(50, cents))}%` }} />
      </div>
      <div className="hint">{pitch ? (inTune ? 'In tune' : cents < 0 ? `${-cents} cents flat: tune up` : `${cents} cents sharp: tune down`) : running ? 'Play one string' : 'Turn the input on'}</div>
    </div>
  );
}

/** Record the pedalboard sound into the library as "Guitar take N". */
function TakeRecorder({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [saved, setSaved] = useState('');
  const recRef = useRef<MicRecorder | null>(null);
  const takes = useStore((s) => s.project.sounds.filter((x) => x.name.startsWith('Guitar take')).length);

  useEffect(() => {
    if (seconds === null) return;
    const id = window.setInterval(() => {
      const rec = recRef.current;
      if (rec) setSeconds(rec.seconds);
    }, 200);
    return () => window.clearInterval(id);
  }, [seconds === null]);

  useEffect(() => {
    if (!running && recRef.current) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const start = async () => {
    const rec = new MicRecorder(getAudioContext());
    await rec.startFromNode(guitar.recordTap);
    recRef.current = rec;
    setSaved('');
    setSeconds(0);
  };

  const stop = async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setSeconds(null);
    const take = await rec.stop();
    let samples = trimSilence(take.samples, take.sampleRate, 0.01);
    samples = applyEdgeFades(samples.slice(), take.sampleRate);
    if (samples.length < take.sampleRate * 0.2) {
      setSaved('Nothing to keep (the take was silent).');
      return;
    }
    const name = `Guitar take ${takes + 1}`;
    await actions.addRecording(samples, take.sampleRate, name);
    setSaved(`Saved "${name}" to Sounds.`);
  };

  return (
    <span className="take-recorder">
      {seconds === null ? (
        <button className="rec" disabled={!running} onClick={() => void start()} title={running ? 'Record the pedalboard sound into Sounds' : 'Turn the input on first'}>
          ● Record take
        </button>
      ) : (
        <button className="primary" onClick={() => void stop()}>
          ■ Stop ({seconds.toFixed(1)} s)
        </button>
      )}
      {saved && <span className="hint">{saved}</span>}
    </span>
  );
}
