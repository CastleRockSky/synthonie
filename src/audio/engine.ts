// The audio engine. One code path builds the graph for live playback (AudioContext)
// and for export (OfflineAudioContext), so what you hear is what ends up in the file.
//
// Graph:  layer -> filter -> gain -> pan -> sceneBus -> master -> speakers
//                                      \-> send -> sceneReverb -> reverbIn -> convolver -> reverbOut -> master
//         drum rows / melody -> beatBus -> master   (beatBus -> beatSend -> reverbIn)

import type { Layer, Pattern, Project, SoundId } from '../model/types';
import type { SoundBank } from './bank';
import { crossfadeLoop } from './dsp';
import { makeImpulse } from './reverb';
import { Rng } from './rng';
import { midiToFreq, rowToMidi } from './scales';
import { INSTRUMENTS, playNote, type Instrument } from './synth';
import { audioBufferChannels, channelsToAudioBuffer } from './wav';

/** Seconds of audio scheduled ahead of the clock, and how often we top it up. */
const LOOKAHEAD = 0.2;
const TICK_MS = 40;

/** Muffle knob: 0..1 openness -> low-pass cutoff from 150 Hz to 20 kHz (logarithmic). */
export function muffleToFreq(openness: number): number {
  const x = Math.min(1, Math.max(0, openness));
  return 150 * Math.pow(20000 / 150, x);
}

export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

export function patternSeconds(p: Pattern): number {
  return stepSeconds(p.bpm) * p.steps;
}

interface Buses {
  ctx: BaseAudioContext;
  master: GainNode;
  sceneBus: GainNode;
  sceneReverb: GainNode;
  beatBus: GainNode;
  beatSend: GainNode;
  reverbIn: GainNode;
  convolver: ConvolverNode;
  reverbOut: GainNode;
}

function makeBuses(ctx: BaseAudioContext, p: Project, dest: AudioNode): Buses {
  const master = ctx.createGain();
  master.gain.value = p.master.volume;
  master.connect(dest);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, p.master.reverbSize);
  const reverbIn = ctx.createGain();
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = p.master.reverbMix;
  reverbIn.connect(convolver).connect(reverbOut).connect(master);

  const sceneOn = p.sceneEnabled ? 1 : 0;
  const sceneBus = ctx.createGain();
  sceneBus.gain.value = sceneOn;
  sceneBus.connect(master);
  const sceneReverb = ctx.createGain();
  sceneReverb.gain.value = sceneOn;
  sceneReverb.connect(reverbIn);

  const beatBus = ctx.createGain();
  beatBus.gain.value = p.beatEnabled ? p.pattern.volume : 0;
  beatBus.connect(master);
  const beatSend = ctx.createGain();
  beatSend.gain.value = p.pattern.space;
  beatBus.connect(beatSend).connect(reverbIn);

  return { ctx, master, sceneBus, sceneReverb, beatBus, beatSend, reverbIn, convolver, reverbOut };
}

/** Smoothly move a parameter while playing, or set it outright before playback starts. */
function setParam(param: AudioParam, value: number, ctx: BaseAudioContext, immediate: boolean): void {
  if (immediate) param.value = value;
  else param.setTargetAtTime(value, ctx.currentTime, 0.02);
}

/** One soundscape layer: filter -> gain -> pan -> scene bus (+ reverb send). */
class LayerVoice {
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly send: GainNode;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly rng: Rng;
  private loopSrc?: AudioBufferSourceNode;
  private nextRandom = 0;

  constructor(
    private readonly buses: Buses,
    private readonly bank: SoundBank,
    public layer: Layer,
    seed: number,
  ) {
    const ctx = buses.ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.gain = ctx.createGain();
    this.pan = ctx.createStereoPanner();
    this.send = ctx.createGain();
    this.filter.connect(this.gain).connect(this.pan);
    this.pan.connect(buses.sceneBus);
    this.pan.connect(this.send).connect(buses.sceneReverb);
    this.rng = new Rng(seed);
    this.apply(layer, true);
  }

  /** Live parameter changes (sliders). */
  apply(layer: Layer, immediate = false): void {
    this.layer = layer;
    const ctx = this.buses.ctx;
    setParam(this.gain.gain, layer.muted ? 0 : layer.volume, ctx, immediate);
    setParam(this.pan.pan, layer.pan, ctx, immediate);
    setParam(this.filter.frequency, muffleToFreq(layer.muffle), ctx, immediate);
    setParam(this.send.gain, layer.space, ctx, immediate);
    if (this.loopSrc) setParam(this.loopSrc.playbackRate, layer.pitch, ctx, immediate);
  }

  start(at: number): void {
    const buf = this.bank.get(this.layer.soundId);
    if (!buf) return;
    if (this.layer.mode === 'random') {
      this.nextRandom = at + this.rng.range(0, Math.max(0.2, this.layer.randomMax));
      return;
    }
    const src = this.buses.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = this.layer.mode === 'loop';
    src.playbackRate.value = this.layer.pitch;
    src.connect(this.filter);
    src.start(at);
    this.loopSrc = src;
    this.track(src);
  }

  /** Schedule random-mode hits that fall inside [from, to). */
  schedule(from: number, to: number): void {
    if (this.layer.mode !== 'random') return;
    const buf = this.bank.get(this.layer.soundId);
    if (!buf) return;
    const min = Math.max(0.05, this.layer.randomMin);
    const max = Math.max(min, this.layer.randomMax);
    let guard = 0;
    while (this.nextRandom < to && guard++ < 500) {
      const t = Math.max(this.nextRandom, from);
      const src = this.buses.ctx.createBufferSource();
      src.buffer = buf;
      const semitones = (this.rng.next() * 2 - 1) * this.layer.randomPitch * 7;
      src.playbackRate.value = this.layer.pitch * Math.pow(2, semitones / 12);
      src.connect(this.filter);
      src.start(t);
      this.track(src);
      this.nextRandom += this.rng.range(min, max);
    }
  }

  stop(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.pan.disconnect();
    this.send.disconnect();
  }

  private track(src: AudioBufferSourceNode): void {
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }
}

/** The step sequencer: drum rows and the melody grid. */
class BeatPlayer {
  private readonly rowGains = new Map<string, GainNode>();
  private readonly melodyGain: GainNode;
  private nextStepTime = 0;
  private nextStep = 0;
  private queue: { step: number; time: number }[] = [];

  constructor(
    private readonly buses: Buses,
    private readonly bank: SoundBank,
  ) {
    this.melodyGain = buses.ctx.createGain();
    this.melodyGain.connect(buses.beatBus);
  }

  reset(at: number): void {
    this.nextStepTime = at;
    this.nextStep = 0;
    this.queue = [];
  }

  apply(p: Pattern, enabled: boolean, immediate = false): void {
    const ctx = this.buses.ctx;
    setParam(this.buses.beatBus.gain, enabled ? p.volume : 0, ctx, immediate);
    setParam(this.buses.beatSend.gain, p.space, ctx, immediate);
    setParam(this.melodyGain.gain, p.melody.muted ? 0 : p.melody.volume, ctx, immediate);
    for (const row of p.drums) setParam(this.rowGain(row.id).gain, row.muted ? 0 : row.volume, ctx, immediate);
  }

  /** Schedule every step that starts before `to`. Reads the pattern fresh each call. */
  schedule(to: number, p: Pattern): void {
    const stepDur = stepSeconds(p.bpm);
    let guard = 0;
    while (this.nextStepTime < to && guard++ < 4096) {
      const step = this.nextStep % p.steps;
      const swing = step % 2 === 1 ? p.swing * stepDur * 0.5 : 0;
      const t = this.nextStepTime + swing;
      this.scheduleDrums(p, step, t);
      this.scheduleMelody(p, step, t, stepDur);
      this.queue.push({ step, time: this.nextStepTime });
      if (this.queue.length > 256) this.queue.splice(0, 128);
      this.nextStepTime += stepDur;
      this.nextStep++;
    }
  }

  /** The step the listener is hearing right now (for the playhead). */
  currentStep(now: number): number {
    let s = -1;
    let i = 0;
    for (; i < this.queue.length; i++) {
      if (this.queue[i].time <= now) s = this.queue[i].step;
      else break;
    }
    if (i > 1) this.queue.splice(0, i - 1);
    return s;
  }

  private rowGain(id: string): GainNode {
    let g = this.rowGains.get(id);
    if (!g) {
      g = this.buses.ctx.createGain();
      g.connect(this.buses.beatBus);
      this.rowGains.set(id, g);
    }
    return g;
  }

  private scheduleDrums(p: Pattern, step: number, t: number): void {
    for (const row of p.drums) {
      if (row.muted || !row.steps[step]) continue;
      const buf = this.bank.get(row.soundId);
      if (!buf) continue;
      const src = this.buses.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = row.pitch;
      src.connect(this.rowGain(row.id));
      src.start(t);
    }
  }

  private scheduleMelody(p: Pattern, step: number, t: number, stepDur: number): void {
    const m = p.melody;
    if (m.muted) return;
    const inst = INSTRUMENTS[m.instrument];
    for (let r = 0; r < p.rows; r++) {
      const cells = m.cells[r];
      // A note starts where a cell is on and the previous cell is off; adjacent cells join.
      if (!cells?.[step] || (step > 0 && cells[step - 1])) continue;
      let len = 1;
      while (step + len < p.steps && cells[step + len]) len++;
      const midi = rowToMidi(p.rows - 1 - r, p.scale, p.root, p.octave) + inst.octave * 12;
      playNote(this.buses.ctx, this.melodyGain, inst, midiToFreq(midi), t, len * stepDur);
    }
  }
}

export interface RenderOptions {
  sampleRate?: number;
  /** Seconds of tail to fold into the start so the file loops seamlessly. 0 = none. */
  loopCrossfade?: number;
  /** Also fade the start in (good for ambience, bad for beats). */
  headFade?: boolean;
}

export class Engine {
  playing = false;
  onPlayingChange?: (playing: boolean) => void;

  private buses?: Buses;
  private beat?: BeatPlayer;
  private readonly voices = new Map<string, LayerVoice>();
  private timer?: number;
  private lastHorizon = 0;
  private seen?: Project;
  private previewGain?: GainNode;
  private readonly previews = new Set<AudioBufferSourceNode>();

  constructor(
    private readonly getCtx: () => AudioContext,
    readonly bank: SoundBank,
    private readonly getProject: () => Project,
  ) {}

  get ctx(): AudioContext {
    return this.getCtx();
  }

  async play(): Promise<void> {
    if (this.playing) return;
    const ctx = this.ctx;
    await ctx.resume();
    const p = this.getProject();
    this.buses = makeBuses(ctx, p, ctx.destination);
    this.beat = new BeatPlayer(this.buses, this.bank);
    const at = ctx.currentTime + 0.05;
    p.layers.forEach((layer, i) => this.startVoice(layer, at, i));
    this.beat.reset(at);
    this.beat.apply(p.pattern, p.beatEnabled, true);
    this.lastHorizon = at;
    this.seen = p;
    this.setPlaying(true);
    this.tick();
  }

  stop(): void {
    if (!this.playing) return;
    window.clearTimeout(this.timer);
    this.setPlaying(false);
    for (const v of this.voices.values()) v.stop();
    this.voices.clear();
    const buses = this.buses;
    this.buses = undefined;
    this.beat = undefined;
    if (buses) {
      // Quick fade instead of a hard cut, then drop the whole graph.
      buses.master.gain.setTargetAtTime(0, buses.ctx.currentTime, 0.01);
      window.setTimeout(() => buses.master.disconnect(), 150);
    }
  }

  toggle(): void {
    if (this.playing) this.stop();
    else void this.play();
  }

  /** Called on every project change. While playing, applies the difference live. */
  sync(p: Project): void {
    const prev = this.seen;
    this.seen = p;
    if (!this.playing || !this.buses || !this.beat || !prev || prev === p) return;
    const b = this.buses;
    const ctx = b.ctx;

    if (p.master !== prev.master) {
      setParam(b.master.gain, p.master.volume, ctx, false);
      setParam(b.reverbOut.gain, p.master.reverbMix, ctx, false);
      if (p.master.reverbSize !== prev.master.reverbSize) b.convolver.buffer = makeImpulse(ctx, p.master.reverbSize);
    }
    if (p.sceneEnabled !== prev.sceneEnabled) {
      const v = p.sceneEnabled ? 1 : 0;
      setParam(b.sceneBus.gain, v, ctx, false);
      setParam(b.sceneReverb.gain, v, ctx, false);
    }
    if (p.layers !== prev.layers) {
      const keep = new Set<string>();
      p.layers.forEach((layer, i) => {
        keep.add(layer.id);
        const voice = this.voices.get(layer.id);
        const old = prev.layers.find((l) => l.id === layer.id);
        if (!voice) {
          this.startVoice(layer, ctx.currentTime + 0.02, i);
        } else if (layer !== old) {
          const restart = !old || layer.soundId !== old.soundId || layer.mode !== old.mode;
          if (restart) {
            voice.stop();
            this.voices.delete(layer.id);
            this.startVoice(layer, ctx.currentTime + 0.02, i);
          } else {
            voice.apply(layer);
          }
        }
      });
      for (const [id, voice] of this.voices) {
        if (!keep.has(id)) {
          voice.stop();
          this.voices.delete(id);
        }
      }
    }
    if (p.pattern !== prev.pattern || p.beatEnabled !== prev.beatEnabled) this.beat.apply(p.pattern, p.beatEnabled);
  }

  /** Step currently sounding, or -1 when stopped. */
  currentStep(): number {
    return this.beat?.currentStep(this.ctx.currentTime) ?? -1;
  }

  /** Play a library sound once, straight to the speakers. */
  async preview(soundId: SoundId): Promise<void> {
    const ctx = this.ctx;
    await ctx.resume();
    const buf = this.bank.get(soundId);
    if (!buf) return;
    this.stopPreviews();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.previewBus());
    src.start();
    this.previews.add(src);
    src.onended = () => this.previews.delete(src);
  }

  /** Sound a single melody note (used when drawing in the grid). */
  async previewNote(inst: Instrument, midi: number, seconds = 0.25): Promise<void> {
    const ctx = this.ctx;
    await ctx.resume();
    playNote(ctx, this.previewBus(), inst, midiToFreq(midi + inst.octave * 12), ctx.currentTime, seconds);
  }

  stopPreviews(): void {
    for (const s of this.previews) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.previews.clear();
  }

  /** Offline render of the whole project. Deterministic for a given project. */
  async render(p: Project, seconds: number, opts: RenderOptions = {}): Promise<AudioBuffer> {
    const sr = opts.sampleRate ?? 44100;
    const fade = Math.max(0, opts.loopCrossfade ?? 0);
    const total = seconds + fade;
    const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * sr)), sr);
    const buses = makeBuses(off, p, off.destination);
    const beat = new BeatPlayer(buses, this.bank);
    beat.reset(0);
    beat.apply(p.pattern, p.beatEnabled, true);
    const voices = p.layers.map((layer, i) => {
      const v = new LayerVoice(buses, this.bank, layer, 1000 + i);
      v.start(0);
      return v;
    });
    for (const v of voices) v.schedule(0, total);
    beat.schedule(total, p.pattern);
    const rendered = await off.startRendering();
    if (fade <= 0) return rendered;
    const chans = crossfadeLoop(audioBufferChannels(rendered), fade * sr, opts.headFade ?? true);
    return channelsToAudioBuffer(chans, sr);
  }

  private startVoice(layer: Layer, at: number, index: number): void {
    if (!this.buses) return;
    const voice = new LayerVoice(this.buses, this.bank, layer, Date.now() + index * 7919);
    voice.start(at);
    this.voices.set(layer.id, voice);
  }

  private tick = (): void => {
    if (!this.playing || !this.buses || !this.beat) return;
    const p = this.getProject();
    const to = this.ctx.currentTime + LOOKAHEAD;
    for (const v of this.voices.values()) v.schedule(this.lastHorizon, to);
    this.beat.schedule(to, p.pattern);
    this.lastHorizon = to;
    this.timer = window.setTimeout(this.tick, TICK_MS);
  };

  private previewBus(): GainNode {
    if (!this.previewGain) {
      this.previewGain = this.ctx.createGain();
      this.previewGain.gain.value = 0.8;
      this.previewGain.connect(this.ctx.destination);
    }
    return this.previewGain;
  }

  private setPlaying(v: boolean): void {
    this.playing = v;
    this.onPlayingChange?.(v);
  }
}
