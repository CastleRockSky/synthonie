// Microphone recording through an AudioWorklet, so we get raw float samples (lossless)
// and a live level meter. The worklet code is inlined as a Blob URL so no build config
// is needed for it.

const WORKLET_CODE = `
class SynthonieRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.frames = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'flush') {
        this.flush();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }
  flush() {
    if (!this.frames) return;
    const out = new Float32Array(this.frames);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    this.chunks = [];
    this.frames = 0;
    this.port.postMessage({ type: 'chunk', samples: out }, [out.buffer]);
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length) {
      const n = input[0].length;
      const mono = new Float32Array(n);
      for (const ch of input) for (let i = 0; i < n; i++) mono[i] += ch[i] / input.length;
      let peak = 0;
      for (let i = 0; i < n; i++) { const a = Math.abs(mono[i]); if (a > peak) peak = a; }
      this.chunks.push(mono);
      this.frames += n;
      if (this.frames >= 4096) {
        this.port.postMessage({ type: 'level', peak });
        this.flush();
      }
    }
    return true;
  }
}
registerProcessor('synthonie-recorder', SynthonieRecorder);
`;

const loadedContexts = new WeakSet<BaseAudioContext>();

export interface Take {
  samples: Float32Array;
  sampleRate: number;
}

export class MicRecorder {
  onLevel?: (peak: number) => void;

  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private node?: AudioWorkletNode;
  private sink?: GainNode;
  private chunks: Float32Array[] = [];
  private startedAt = 0;

  constructor(private readonly ctx: AudioContext) {}

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof AudioWorkletNode !== 'undefined'
    );
  }

  get seconds(): number {
    return this.startedAt ? this.ctx.currentTime - this.startedAt : 0;
  }

  async start(opts: { voiceMode: boolean }): Promise<void> {
    const ctx = this.ctx;
    await ctx.resume();
    if (!loadedContexts.has(ctx)) {
      const url = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      loadedContexts.add(ctx);
    }
    // "Voice mode" turns on the browser's cleanup, which helps speech but chews up
    // sound effects; off by default so foley recordings stay raw.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: opts.voiceMode,
        noiseSuppression: opts.voiceMode,
        autoGainControl: opts.voiceMode,
      },
      video: false,
    });
    this.chunks = [];
    this.source = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, 'synthonie-recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    this.node.port.onmessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; samples?: Float32Array; peak?: number };
      if (d?.type === 'chunk' && d.samples) this.chunks.push(d.samples);
      else if (d?.type === 'level' && typeof d.peak === 'number') this.onLevel?.(d.peak);
    };
    // Worklets only process while connected to the destination; a silent sink does that.
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.node).connect(this.sink).connect(ctx.destination);
    this.startedAt = ctx.currentTime;
  }

  async stop(): Promise<Take> {
    const node = this.node;
    if (node) {
      await new Promise<void>((resolve) => {
        const prev = node.port.onmessage;
        node.port.onmessage = (e: MessageEvent) => {
          prev?.call(node.port, e);
          if ((e.data as { type?: string })?.type === 'flushed') resolve();
        };
        node.port.postMessage('flush');
        window.setTimeout(resolve, 300); // never hang if the worklet is already gone
      });
    }
    this.cleanup();
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const samples = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) {
      samples.set(c, o);
      o += c.length;
    }
    this.chunks = [];
    return { samples, sampleRate: this.ctx.sampleRate };
  }

  cancel(): void {
    this.cleanup();
    this.chunks = [];
  }

  private cleanup(): void {
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source = undefined;
    this.node = undefined;
    this.sink = undefined;
    this.stream = undefined;
    this.startedAt = 0;
  }
}
