import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bank, engine } from './app/instances';
import { useStore } from './model/store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

// Handy in DevTools: synthonie.engine, synthonie.bank, synthonie.store.getState()
window.synthonie = { engine, bank, store: useStore };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
