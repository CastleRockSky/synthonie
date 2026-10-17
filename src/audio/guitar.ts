// The guitar rig: an input (a USB interface, what the PC is playing, or the demo riff)
// through a fixed chain of pedals, out to the speakers and to the recorder.
//
//   input -> gain -> [gate] -> [comp] -> [drive] -> [amp + cab] -> [chorus] -> [tremolo]
//         -> [delay] -> [reverb] -> volume -> speakers (monitor) and the record tap
//
// Every pedal is built once as a dry/wet pair, so switching it on or off is a short
// crossfade with no click. Knobs are 0..1 in the project and mapped to units here.

import type { GuitarRig, PedalKey } from '../model/types';
import { PEDAL_ORDER } from '../model/guitar-presets';
import { renderDemoRiff } from './guitar-demo';
import { detectPitch, type Pitch } from './pitch';
import { makeImpulse } from './reverb';
import { channelsToAudioBuffer } from './wav';

export type GuitarSource =
  | { kind: 'demo' }
  | { kind: 'device'; deviceId: string | null; channel: 'left' | 'right' | 'both' }
  | { kind: 'system' };

export interface AudioInputInfo {
  deviceId: string;
  label: string;
}

export interface GuitarLevels {
  input: number;
  output: number;
}

/** A noise gate: an envelope follower that opens fast and closes gently below the threshold. */
const GATE_WORKLET = `
class SynthonieGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'threshold', defaultValue: 0.01, minValue: 0, maxValue: 1 }];
  }
  constructor() { super(); this.env = 0; this.gain = 1; }
  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;
    const thr = params.threshold[0];
    const n = input[0].length;
    for (let i = 0; i < n; i++) {
      let a = 0;
      for (let c = 0; c < input.length; c++) { const v = Math.abs(input[c][i]); if (v > a) a = v; }
      this.env += (a - this.env) * (a > this.env ? 0.3 : 0.0004);
      const target = this.env > thr ? 1 : 0;
      this.gain += (target - this.gain) * (target > this.gain ? 0.02 : 0.0006);
      for (let c = 0; c < output.length; c++) output[c][i] = (input[c] || input[0])[i] * this.gain;
    }
    return true;
  }
}
registerProcessor('synthonie-gate', SynthonieGate);
`;

/** A waveshaper curve: 'soft' is a symmetric overdrive, 'tube' clips the negative half harder. */
export function shaperCurve(kind: 'soft' | 'tube', samples = 4096): Float32Array<ArrayBuffer> {
  const c = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    if (kind === 'soft') c[i] = Math.tanh(1.5 * x) / Math.tanh(1.5);
    else c[i] = x >= 0 ? Math.tanh(1.2 * x) / Math.tanh(1.2) : Math.tanh(2.2 * x) / Math.tanh(2.2);
  }
  return c;
}

interface Pedal {
  input: GainNode;
  output: GainNode;
  dry: GainNode;
  wet: GainNode;
}

interface Nodes {
  gate: AudioWorkletNode;
  comp: DynamicsCompressorNode;
  compMakeup: GainNode;
  drivePre: GainNode;
  driveTone: BiquadFilterNode;
  driveLevel: GainNode;
  ampPre: GainNode;
  ampBass: BiquadFilterNode;
  ampMid: BiquadFilterNode;
  ampTreble: BiquadFilterNode;
  cabWet: GainNode;
  cabBypass: GainNode;
  chorusLfo: OscillatorNode;
  chorusDepth: GainNode;
  chorusDry: GainNode;
  chorusWet: GainNode;
  tremLfo: OscillatorNode;
  tremDepth: GainNode;
  tremGain: GainNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayDry: GainNode;
  delayWet: GainNode;
  convolver: ConvolverNode;
  reverbDry: GainNode;
  reverbWet: GainNode;
}

const describe = (e: unknown): string => {
  const err = e as DOMException;
  if (err?.name === 'NotAllowedError') return 'The microphone/interface was blocked. Allow it and try again.';
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'That input is not plugged in any more. Pick another one.';
  if (err?.name === 'NotReadableError') return 'Another program has that input open. Close it and try again.';
  return err?.message || String(e);
};

export class GuitarEngine {
  running = false;
  source: GuitarSource | null = null;
  error: string | null = null;
  /** The UI subscribes to this to learn about start/stop and errors. */
  onChange?: () => void;

  private rig: GuitarRig;
  private ctx?: AudioContext;
  private built = false;
  private workletLoaded = false;
  private stream?: MediaStream;
  private streamSource?: MediaStreamAudioSourceNode;
  private splitter?: ChannelSplitterNode;
  private mix?: GainNode;
  private demoSource?: AudioBufferSourceNode;
  private demoBuffer?: AudioBuffer;
  private inputGain!: GainNode;
  private inputAnalyser!: AnalyserNode;
  private outputAnalyser!: AnalyserNode;
  private out!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private monitor!: GainNode;
  private pedals!: Record<PedalKey, Pedal>;
  private n!: Nodes;
  private reverbSize = -1;
  private readonly levelBuf: Float32Array<ArrayBuffer> = new Float32Array(1024);
  private readonly pitchBuf: Float32Array<ArrayBuffer> = new Float32Array(4096);

  constructor(
    private readonly getCtx: () => AudioContext,
    rig: GuitarRig,
  ) {
    this.rig = rig;
  }

  /** Where the recorder taps the finished sound (after the volume knob and limiter, before monitoring). */
  get recordTap(): AudioNode {
    return this.limiter;
  }

  async listInputs(): Promise<AudioInputInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || (d.deviceId === 'default' ? 'Default input' : `Input ${i + 1}`) }));
  }

  async start(source: GuitarSource): Promise<void> {
    const ctx = this.getCtx();
    await ctx.resume();
    await this.build(ctx);
    this.detachSource();
    try {
      if (source.kind === 'demo') {
        if (!this.demoBuffer) this.demoBuffer = channelsToAudioBuffer([renderDemoRiff(ctx.sampleRate)], ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = this.demoBuffer;
        src.loop = true;
        src.connect(this.inputGain);
        src.start();
        this.demoSource = src;
      } else if (source.kind === 'device') {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: source.deviceId ? { exact: source.deviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: { ideal: 2 },
          },
          video: false,
        });
        this.attachStream(stream, source.channel);
      } else {
        // "What the PC is playing": the desktop shell grants this with system loopback audio;
        // a browser shows its screen-share picker, where "Share system audio" must be ticked.
        const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        stream.getVideoTracks().forEach((t) => t.stop());
        if (!stream.getAudioTracks().length) throw new Error('No audio was shared. Choose the whole screen and tick "Share system audio".');
        this.attachStream(stream, 'both');
      }
      this.source = source;
      this.running = true;
      this.error = null;
      this.apply(this.rig);
    } catch (e) {
      this.detachSource();
      this.running = false;
      this.error = describe(e);
      throw e;
    } finally {
      this.onChange?.();
    }
  }

  stop(): void {
    this.detachSource();
    this.running = false;
    this.onChange?.();
  }

  /** Live knob changes. Safe to call before the chain exists; the values are kept for later. */
  apply(rig: GuitarRig, immediate = false): void {
    this.rig = rig;
    if (!this.built || !this.ctx) return;
    const ctx = this.ctx;
    const n = this.n;
    const t = ctx.currentTime;
    const set = (p: AudioParam, v: number) => (immediate ? (p.value = v) : p.setTargetAtTime(v, t, 0.02));
    const bypass = (key: PedalKey, on: boolean) => {
      set(this.pedals[key].wet.gain, on ? 1 : 0);
      set(this.pedals[key].dry.gain, on ? 0 : 1);
    };

    set(this.inputGain.gain, 0.25 * Math.pow(16, rig.inputGain));
    set(this.out.gain, rig.volume * 1.2);
    // Never monitor "what the PC is playing": that would feed the speakers back into themselves.
    set(this.monitor.gain, rig.monitor && this.source?.kind !== 'system' ? 1 : 0);

    bypass('gate', rig.gate.on);
    const thr = n.gate.parameters.get('threshold');
    if (thr) set(thr, 0.002 * Math.pow(10, 2.2 * rig.gate.threshold));

    bypass('comp', rig.comp.on);
    set(n.comp.threshold, -10 - 30 * rig.comp.amount);
    set(n.comp.ratio, 2 + 10 * rig.comp.amount);
    set(n.compMakeup.gain, 1 + 2 * rig.comp.amount);

    bypass('drive', rig.drive.on);
    set(n.drivePre.gain, 1 + 20 * rig.drive.drive);
    set(n.driveTone.frequency, 1200 * Math.pow(8000 / 1200, rig.drive.tone));
    set(n.driveLevel.gain, (0.1 + 0.9 * rig.drive.level) * 0.5);

    bypass('amp', rig.amp.on);
    // A guitar interface delivers peaks around 0.1 to 0.3, so gain 0 is still clean and gain 1 is saturated.
    set(n.ampPre.gain, 0.6 + 15 * rig.amp.gain);
    set(n.ampBass.gain, (rig.amp.bass - 0.5) * 20);
    set(n.ampMid.gain, (rig.amp.mid - 0.5) * 20);
    set(n.ampTreble.gain, (rig.amp.treble - 0.5) * 20);
    set(n.cabWet.gain, rig.amp.cab ? 1 : 0);
    set(n.cabBypass.gain, rig.amp.cab ? 0 : 1);

    bypass('chorus', rig.chorus.on);
    set(n.chorusLfo.frequency, 0.2 + 4.8 * rig.chorus.rate);
    set(n.chorusDepth.gain, 0.0005 + 0.006 * rig.chorus.depth);
    set(n.chorusWet.gain, rig.chorus.mix);
    set(n.chorusDry.gain, 1 - 0.5 * rig.chorus.mix);

    bypass('tremolo', rig.tremolo.on);
    set(n.tremLfo.frequency, 0.5 + 11.5 * rig.tremolo.rate);
    set(n.tremDepth.gain, rig.tremolo.depth / 2);
    set(n.tremGain.gain, 1 - rig.tremolo.depth / 2);

    bypass('delay', rig.delay.on);
    set(n.delayNode.delayTime, 0.05 + 0.95 * rig.delay.time);
    set(n.delayFeedback.gain, 0.85 * rig.delay.feedback);
    set(n.delayWet.gain, rig.delay.mix);

    bypass('reverb', rig.reverb.on);
    const size = Math.round((0.3 + 4.7 * rig.reverb.size) * 4) / 4; // quarter-second steps, so dragging does not rebuild constantly
    if (size !== this.reverbSize) {
      this.reverbSize = size;
      n.convolver.buffer = makeImpulse(ctx, size);
    }
    set(n.reverbWet.gain, rig.reverb.mix * 1.2);
    set(n.reverbDry.gain, 1 - 0.3 * rig.reverb.mix);
  }

  /** Peak levels 0..1 at the input (after the gain knob) and at the output. */
  levels(): GuitarLevels {
    if (!this.built) return { input: 0, output: 0 };
    return { input: this.peak(this.inputAnalyser), output: this.peak(this.outputAnalyser) };
  }

  /** The note being played, from the input, or null when there is no clear note. */
  pitch(): Pitch | null {
    if (!this.built || !this.ctx) return null;
    this.inputAnalyser.getFloatTimeDomainData(this.pitchBuf);
    return detectPitch(this.pitchBuf, this.ctx.sampleRate);
  }

  private peak(analyser: AnalyserNode): number {
    analyser.getFloatTimeDomainData(this.levelBuf);
    let p = 0;
    for (let i = 0; i < this.levelBuf.length; i++) {
      const a = Math.abs(this.levelBuf[i]);
      if (a > p) p = a;
    }
    return Math.min(1, p);
  }

  private attachStream(stream: MediaStream, channel: 'left' | 'right' | 'both'): void {
    const ctx = this.ctx!;
    this.stream = stream;
    this.streamSource = ctx.createMediaStreamSource(stream);
    // Interfaces show up as a stereo pair: the guitar is normally input 1 (left). Pick one
    // side, or mix both, and carry on in mono from here.
    this.splitter = ctx.createChannelSplitter(2);
    this.mix = ctx.createGain();
    this.streamSource.connect(this.splitter);
    if (channel === 'both') {
      this.mix.gain.value = 0.5;
      this.splitter.connect(this.mix, 0);
      this.splitter.connect(this.mix, 1);
    } else {
      this.splitter.connect(this.mix, channel === 'left' ? 0 : 1);
    }
    this.mix.connect(this.inputGain);
    for (const track of stream.getAudioTracks()) track.onended = () => this.stop();
  }

  private detachSource(): void {
    this.demoSource?.stop();
    this.demoSource?.disconnect();
    this.demoSource = undefined;
    this.streamSource?.disconnect();
    this.splitter?.disconnect();
    this.mix?.disconnect();
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.streamSource = undefined;
    this.splitter = undefined;
    this.mix = undefined;
    this.stream = undefined;
    this.source = null;
  }

  private async build(ctx: AudioContext): Promise<void> {
    if (this.built) return;
    this.ctx = ctx;
    if (!this.workletLoaded) {
      const url = URL.createObjectURL(new Blob([GATE_WORKLET], { type: 'application/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      this.workletLoaded = true;
    }
    const g = (value = 1) => {
      const node = ctx.createGain();
      node.gain.value = value;
      return node;
    };
    const filter = (type: BiquadFilterType, frequency: number, q = 1, gain = 0) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = q;
      f.gain.value = gain;
      return f;
    };
    const lfo = (frequency: number) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = frequency;
      o.start();
      return o;
    };
    const pedal = (build: (input: AudioNode) => AudioNode): Pedal => {
      const input = g();
      const output = g();
      const dry = g(1);
      const wet = g(0);
      input.connect(dry).connect(output);
      build(input).connect(wet).connect(output);
      return { input, output, dry, wet };
    };
    const n = {} as Nodes;

    const gate = pedal((input) => {
      n.gate = new AudioWorkletNode(ctx, 'synthonie-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      input.connect(n.gate);
      return n.gate;
    });
    const comp = pedal((input) => {
      n.comp = ctx.createDynamicsCompressor();
      n.comp.knee.value = 10;
      n.comp.attack.value = 0.005;
      n.comp.release.value = 0.15;
      n.compMakeup = g();
      input.connect(n.comp).connect(n.compMakeup);
      return n.compMakeup;
    });
    const drive = pedal((input) => {
      n.drivePre = g();
      const shaper = ctx.createWaveShaper();
      shaper.curve = shaperCurve('soft');
      shaper.oversample = '4x';
      n.driveTone = filter('lowpass', 4000, 0.7);
      n.driveLevel = g(0.5);
      input.connect(n.drivePre).connect(shaper).connect(n.driveTone).connect(n.driveLevel);
      return n.driveLevel;
    });
    const amp = pedal((input) => {
      n.ampPre = g();
      const shaper = ctx.createWaveShaper();
      shaper.curve = shaperCurve('tube');
      shaper.oversample = '4x';
      n.ampBass = filter('lowshelf', 120);
      n.ampMid = filter('peaking', 800, 0.8);
      n.ampTreble = filter('highshelf', 3200);
      // The "cabinet": a speaker's rolled-off bottom and top, with a little bite in the middle.
      const cabHp = filter('highpass', 80, 0.7);
      const cabLp = filter('lowpass', 5500, 0.8);
      const cabPresence = filter('peaking', 2500, 1, 3);
      n.cabWet = g(1);
      n.cabBypass = g(0);
      const level = g(0.4);
      input.connect(n.ampPre).connect(shaper).connect(n.ampBass).connect(n.ampMid).connect(n.ampTreble);
      n.ampTreble.connect(cabHp).connect(cabLp).connect(cabPresence).connect(n.cabWet).connect(level);
      n.ampTreble.connect(n.cabBypass).connect(level);
      return level;
    });
    const chorus = pedal((input) => {
      n.chorusDry = g();
      n.chorusWet = g(0.5);
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = 0.02;
      n.chorusLfo = lfo(1);
      n.chorusDepth = g(0.003);
      n.chorusLfo.connect(n.chorusDepth).connect(delay.delayTime);
      const sum = g();
      input.connect(n.chorusDry).connect(sum);
      input.connect(delay).connect(n.chorusWet).connect(sum);
      return sum;
    });
    const tremolo = pedal((input) => {
      n.tremGain = g();
      n.tremLfo = lfo(5);
      n.tremDepth = g(0.25);
      n.tremLfo.connect(n.tremDepth).connect(n.tremGain.gain);
      input.connect(n.tremGain);
      return n.tremGain;
    });
    const delay = pedal((input) => {
      n.delayDry = g();
      n.delayWet = g(0.3);
      n.delayNode = ctx.createDelay(2);
      n.delayFeedback = g(0.3);
      const darker = filter('lowpass', 3500, 0.7); // repeats get a little duller each time, like tape
      const sum = g();
      input.connect(n.delayDry).connect(sum);
      input.connect(n.delayNode).connect(darker).connect(n.delayFeedback).connect(n.delayNode);
      darker.connect(n.delayWet).connect(sum);
      return sum;
    });
    const reverb = pedal((input) => {
      n.reverbDry = g();
      n.reverbWet = g(0.3);
      n.convolver = ctx.createConvolver();
      const sum = g();
      input.connect(n.reverbDry).connect(sum);
      input.connect(n.convolver).connect(n.reverbWet).connect(sum);
      return sum;
    });
    this.n = n;
    this.pedals = { gate, comp, drive, amp, chorus, tremolo, delay, reverb };

    this.inputGain = g();
    this.inputAnalyser = ctx.createAnalyser();
    this.inputAnalyser.fftSize = 4096;
    this.outputAnalyser = ctx.createAnalyser();
    this.outputAnalyser.fftSize = 1024;
    this.out = g();
    // A limiter at the end, so a wild drive setting cannot clip the speakers or a take.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;
    this.monitor = g();

    this.inputGain.connect(this.inputAnalyser);
    let prev: AudioNode = this.inputAnalyser;
    for (const key of PEDAL_ORDER) {
      prev.connect(this.pedals[key].input);
      prev = this.pedals[key].output;
    }
    prev.connect(this.out).connect(this.limiter);
    this.limiter.connect(this.outputAnalyser);
    this.limiter.connect(this.monitor).connect(ctx.destination);

    this.built = true;
    this.apply(this.rig, true);
  }
}
