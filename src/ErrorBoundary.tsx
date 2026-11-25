import { Component, type ReactNode } from "react";

// Last-resort safety net: a render error should never leave the user with a blank window.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("UI crashed:", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <h2>Something went wrong</h2>
        <p>Your saved files are safe. Unsaved changes in the open drawing may be recoverable from File history.</p>
        <pre>{String(this.state.error.message ?? this.state.error).slice(0, 400)}</pre>
        <button className="history-btn primary" onClick={() => location.reload()}>Reload the app</button>
      </div>
    );
  }
}
