import { Component, type ErrorInfo, type ReactNode } from "react";

import { dismissBootSplash } from "../lib/boot-splash";

type Props = {
  children: ReactNode;
  /** Soft remount — bump a key above this boundary without killing Tauri. */
  onReset?: () => void;
};

type State = {
  error: Error | null;
};

const styles = {
  screen: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
    height: "100%",
    margin: 0,
    padding: "32px 24px",
    boxSizing: "border-box" as const,
    background:
      "radial-gradient(ellipse 80% 60% at 50% 0%, rgb(255 255 255 / 0.06), transparent 70%), #0a0a0a",
    color: "#ededed",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    textAlign: "center" as const,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: "-0.02em",
  },
  body: {
    margin: 0,
    maxWidth: 420,
    fontSize: 14,
    lineHeight: 1.5,
    color: "rgba(237, 237, 237, 0.72)",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
  },
  button: {
    appearance: "none" as const,
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: 10,
    padding: "10px 16px",
    background: "rgba(255, 255, 255, 0.1)",
    color: "#ededed",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  buttonSecondary: {
    appearance: "none" as const,
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    padding: "10px 16px",
    background: "transparent",
    color: "rgba(237, 237, 237, 0.85)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};

/**
 * Catches render errors so a single bad HMR/update does not blank the WebView.
 * Prefer soft remount; full reload is available as a fallback.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    dismissBootSplash();
    console.error("[desktop] Uncaught render error", error, info.componentStack);
  }

  componentDidUpdate(_: Props, prevState: State) {
    if (this.state.error && !prevState.error) {
      dismissBootSplash();
    }
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div style={styles.screen} role="alert">
        <h1 style={styles.title}>Something went wrong</h1>
        <p style={styles.body}>
          {this.state.error.message || "An unexpected error occurred."}
        </p>
        <div style={styles.actions}>
          <button type="button" style={styles.button} onClick={this.reset}>
            Try again
          </button>
          <button
            type="button"
            style={styles.buttonSecondary}
            onClick={this.reload}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
