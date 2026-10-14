import { useEffect, type ReactNode } from 'react';

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const panFmt = (v: number) => (Math.abs(v) < 0.05 ? 'centre' : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`);
export const pitchFmt = (v: number) => `${v.toFixed(2)}×`;
export const secFmt = (v: number) => `${v.toFixed(1)} s`;

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format = (v) => v.toFixed(2),
  title,
  reset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  title?: string;
  /** Double-click the slider to jump back to this value. */
  reset?: number;
}) {
  return (
    <label className="slider" title={title}>
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => reset !== undefined && onChange(reset)}
      />
      <span className="slider-value">{format(value)}</span>
    </label>
  );
}

export function Toggle({ on, onChange, label, title }: { on: boolean; onChange: (on: boolean) => void; label: string; title?: string }) {
  return (
    <button className={'toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)} aria-pressed={on} title={title}>
      {label}
    </button>
  );
}

export function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ width }} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
