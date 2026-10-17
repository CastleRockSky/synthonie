import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error?: Error;
}

/** Keeps a bug in one screen from blanking the whole app; work is autosaved, so a reload is safe. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Synthonie crashed:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="splash">
        <div className="splash-icon">😵</div>
        <p>Something went wrong. Your work is autosaved, so just reload.</p>
        <p className="hint">{this.state.error.message}</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
