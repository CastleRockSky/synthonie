import { useEffect, useRef, useState } from 'react';
import * as actions from '../app/actions';
import { guitar } from '../app/instances';
import { getAudioContext } from '../audio/context';
import { applyEdgeFades, trimSilence } from '../audio/dsp';
import type { AudioInputInfo, GuitarSource, LatencyInfo } from '../audio/guitar';
import { canChooseOutput, listOutputs, rememberedOutput, setOutput, type AudioOutputInfo } from '../audio/output';
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
        <OutputPicker running={running} />
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
      <LatencyReadout running={running} />
      {tunerOn && <Tuner running={running} />}

      <PresetBar rig={rig} />

      <Pedalboard rig={rig} />

      <div className="guitar-out">
        <Slider label="Volume" value={rig.volume} min={0} max={1} onChange={(v) => updateGuitar({ volume: v })} format={pct} reset={0.8} />
        <LevelMeter running={running} which="output" />
      </div>
    </section>
  );
}

/** Built-in presets, the kid's saved ones (with delete), and a Save box. */
function PresetBar({ rig }: { rig: GuitarRig }) {
  const applyPreset = useStore((s) => s.applyGuitarPreset);
  const userPresets = useStore((s) => s.guitarPresets);
  const savePreset = useStore((s) => s.saveGuitarPreset);
  const deletePreset = useStore((s) => s.deleteGuitarPreset);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const startNaming = () => {
    const own = rig.preset !== null && userPresets.some((u) => u.name === rig.preset);
    setName(own ? rig.preset! : `My preset ${userPresets.length + 1}`);
    setNaming(true);
  };
  const commit = () => {
    if (name.trim()) savePreset(name);
    setNaming(false);
  };

  return (
    <div className="preset-bar">
      <span className="hint">Presets</span>
      {GUITAR_PRESET_NAMES.map((n) => (
        <button key={n} className={rig.preset === n ? 'primary' : ''} onClick={() => applyPreset(n)}>
          {n}
        </button>
      ))}
      {userPresets.map((u) => (
        <span key={u.name} className="chip-group">
          <button className={rig.preset === u.name ? 'primary' : ''} onClick={() => applyPreset(u.name)} title="A preset you saved">
            ⭐ {u.name}
          </button>
          <button
            className="icon-btn danger chip-x"
            title={`Delete "${u.name}"`}
            onClick={() => {
              if (window.confirm(`Delete the preset "${u.name}"?`)) deletePreset(u.name);
            }}
          >
            ✕
          </button>
        </span>
      ))}
      {naming ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} placeholder="Preset name" maxLength={30} />
          <button type="submit" className="primary">
            Save
          </button>
          <button type="button" onClick={() => setNaming(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button onClick={startNaming} title="Keep the current pedal settings as a preset of your own">
          💾 Save preset
        </button>
      )}
      {rig.preset === null && <span className="hint">(edited)</span>}
    </div>
  );
}

/** Where the whole app plays. Only shown where the browser can choose (Chromium can). */
function OutputPicker({ running }: { running: boolean }) {
  const [outputs, setOutputs] = useState<AudioOutputInfo[]>([]);
  const [value, setValue] = useState(rememberedOutput);
  const [note, setNote] = useState('');
  const supported = canChooseOutput(getAudioContext());

  useEffect(() => {
    void listOutputs().then(setOutputs); // names appear once an input has been opened
  }, [running]);

  if (!supported) return null;
  const pick = async (id: string) => {
    setValue(id);
    setNote('');
    try {
      await setOutput(getAudioContext(), id);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  const known = outputs.some((o) => o.deviceId === value);
  return (
    <label className="field" title="Where everything plays. Headphones on the interface's own jack have the least delay.">
      Output
      <select value={value} onChange={(e) => void pick(e.target.value)}>
        <option value="default">🔊 Default output</option>
        {outputs
          .filter((o) => o.deviceId !== 'default')
          .map((o) => (
            <option key={o.deviceId} value={o.deviceId}>
              🎧 {o.label}
            </option>
          ))}
        {value !== 'default' && !known && <option value={value}>Remembered output</option>}
      </select>
      {note && <span className="error">{note}</span>}
    </label>
  );
}

/** The pick-to-sound delay as the browser reports it, with what to do about it. */
function LatencyReadout({ running }: { running: boolean }) {
  const [info, setInfo] = useState<LatencyInfo | null>(null);
  const [tips, setTips] = useState(false);

  useEffect(() => {
    if (!running) {
      setInfo(null);
      return;
    }
    const tick = () => setInfo(guitar.latencyInfo());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  if (!info) return null;
  const mismatch = info.inputRate !== null && info.inputRate !== info.contextRate;
  return (
    <div className="latency">
      <span>
        Delay: about <b>{Math.round(info.totalMs)} ms</b>
        {info.inputMs === null && <span className="hint"> for the output; a plugged-in guitar adds its input buffer</span>}
      </span>
      {info.compressorOn && <span className="hint">Squash adds about 6 ms while it is on.</span>}
      {mismatch && (
        <span className="hint warn">
          The interface runs at {info.inputRate} Hz but the app at {info.contextRate} Hz. Set it to {info.contextRate} Hz in Windows Sound settings for less delay.
        </span>
      )}
      <button className="icon-btn" onClick={() => setTips(!tips)} title="How to get less delay">
        ?
      </button>
      {tips && (
        <ul className="tips">
          <li>
            Listen through headphones on the interface&apos;s own jack and pick it under <b>Output</b>. Bluetooth adds a tenth of a second or more, and a
            monitor&apos;s HDMI sound is slow too.
          </li>
          <li>In Windows Sound settings, set the interface to the same rate as the app ({info.contextRate} Hz) and switch off its audio enhancements.</li>
          <li>Close other programs that use the sound device.</li>
          <li>Keep Squash off while playing live; it adds 6 ms. Switch it on for a take if you like the sound.</li>
          <li>About 20 ms is the floor for a PC audio stack like this one, which is the sound travelling about 7 metres. Dedicated guitar programs get lower with special drivers; that is on the roadmap.</li>
        </ul>
      )}
    </div>
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
