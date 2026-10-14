import { useEffect, useState } from 'react';
import { boot } from './app/boot';
import { engine } from './app/instances';
import { unlockAudio } from './audio/context';
import { useStore } from './model/store';
import { BeatMaker } from './ui/BeatMaker';
import { ExportDialog } from './ui/ExportDialog';
import { HelpDialog } from './ui/HelpDialog';
import { RecorderPanel } from './ui/RecorderPanel';
import { SoundLibrary } from './ui/SoundLibrary';
import { Soundscape } from './ui/Soundscape';
import { TopBar } from './ui/TopBar';

type Dialog = 'none' | 'record' | 'export' | 'help';

export default function App() {
  const ready = useStore((s) => s.ready);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const sceneOn = useStore((s) => s.project.sceneEnabled);
  const beatOn = useStore((s) => s.project.beatEnabled);
  const [dialog, setDialog] = useState<Dialog>('none');

  useEffect(() => {
    void boot();
  }, []);

  // Browsers keep audio muted until the first click; unlock on the first one anywhere.
  useEffect(() => {
    const unlock = () => void unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Space bar = play/stop, unless typing in a field or a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || dialog !== 'none') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      engine.toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash-icon">🎛️</div>
        <p>Warming up the sounds…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar onOpenExport={() => setDialog('export')} onOpenHelp={() => setDialog('help')} />
      <div className="body">
        <SoundLibrary onRecord={() => setDialog('record')} />
        <main className="main">
          <nav className="tabs">
            <button className={'tab scene' + (tab === 'scene' ? ' active' : '')} onClick={() => setTab('scene')}>
              🌲 Soundscape {!sceneOn && <span className="off">(off)</span>}
            </button>
            <button className={'tab beat' + (tab === 'beat' ? ' active' : '')} onClick={() => setTab('beat')}>
              🥁 Beat Maker {!beatOn && <span className="off">(off)</span>}
            </button>
          </nav>
          {tab === 'scene' ? <Soundscape /> : <BeatMaker />}
        </main>
      </div>
      {dialog === 'record' && <RecorderPanel onClose={() => setDialog('none')} />}
      {dialog === 'export' && <ExportDialog onClose={() => setDialog('none')} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog('none')} />}
    </div>
  );
}
