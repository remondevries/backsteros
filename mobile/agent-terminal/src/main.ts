import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

/**
 * xterm display only. Native React Native owns the PTY WebSocket and pushes
 * batched output via `window.__bosTermWrite` (avoids per-chunk bridges).
 *
 * Host → WebView: write is handled by injected __bosTermWrite / __bosTermClear
 * WebView → Host: ready | input | resize
 */

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
    __bosTermWrite?: (data: string) => void;
    __bosTermClear?: () => void;
    __bosTermFocus?: () => void;
    __bosTermFit?: () => void;
  }
}

function postToHost(message: Record<string, unknown>) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

const host = document.getElementById("terminal");
if (!host) {
  throw new Error("#terminal missing");
}

const term = new Terminal({
  convertEol: false,
  cursorBlink: true,
  fontSize: 12,
  lineHeight: 1.1,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  scrollback: 8_000,
  theme: {
    background: "#0f1115",
    foreground: "#e8e8e8",
    cursor: "#e8e8e8",
    cursorAccent: "#0f1115",
  },
});
const fit = new FitAddon();
term.loadAddon(fit);
term.open(host);
fit.fit();

window.__bosTermWrite = (data: string) => {
  if (typeof data === "string" && data.length > 0) term.write(data);
};
window.__bosTermClear = () => {
  term.clear();
};
window.__bosTermFocus = () => {
  term.focus();
};
window.__bosTermFit = () => {
  fit.fit();
  postToHost({
    type: "resize",
    cols: Math.max(2, term.cols || 80),
    rows: Math.max(1, term.rows || 24),
  });
};

term.onData((data) => {
  postToHost({ type: "input", data });
});

window.addEventListener("resize", () => {
  window.__bosTermFit?.();
});

window.__bosTermFit();
postToHost({ type: "ready" });
