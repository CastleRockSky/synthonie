import { useEffect, useRef } from 'react';

/** Draws peak bins (from SoundBank.peaks) onto a canvas. */
export function Waveform({ peaks, color = '#6fb7d6', height = 34 }: { peaks?: Float32Array; color?: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 200;
    c.width = w * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, height);
    if (!peaks) return;
    g.fillStyle = color;
    const bw = w / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(1, peaks[i] * (height - 2));
      g.fillRect(i * bw, (height - h) / 2, Math.max(1, bw - 0.6), h);
    }
  }, [peaks, color, height]);
  return <canvas ref={ref} className="waveform" style={{ height }} />;
}
