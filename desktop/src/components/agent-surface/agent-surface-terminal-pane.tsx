import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { CanvasAddon } from "@xterm/addon-canvas";
import "@xterm/xterm/css/xterm.css";

import { getPtyWebSocketUrl } from "../../lib/pty";
import {
  AGENT_SURFACE_FOCUS,
  AGENT_SURFACE_FOCUS_ATTR,
  BLUR_AGENT_TERMINAL_EVENT,
  FOCUS_AGENT_TERMINAL_EVENT,
} from "../../lib/agent/agent-surface-focus";

export type AgentSurfaceTerminalPaneProps = {
  cwd: string;
  sessionKey: string;
  label?: string | null;
  /** When false, Tab/Escape focus events for this session are ignored. */
  active?: boolean;
};

export function AgentSurfaceTerminalPane({
  cwd,
  sessionKey,
  label = null,
  active = true,
}: AgentSurfaceTerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily:
        'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      lineHeight: 1.2,
      scrollback: 5000,
      theme: {
        background: "#0c0e12",
        foreground: "#e6e8ec",
        cursor: "#e6e8ec",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    try {
      term.loadAddon(new CanvasAddon());
    } catch {
      /* canvas addon optional */
    }
    term.open(host);
    fit.fit();
    termRef.current = term;

    const cols = term.cols;
    const rows = term.rows;
    const wsUrl = getPtyWebSocketUrl({
      kind: "shell",
      cwd,
      cols,
      rows,
      label: label ?? "Terminal",
      tabLabel: sessionKey,
    });
    const socket = new WebSocket(wsUrl);

    const send = (payload: Record<string, unknown>) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(payload));
    };

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          data?: string;
        };
        if (message.type === "output" && typeof message.data === "string") {
          term.write(message.data);
        }
      } catch {
        /* ignore non-json */
      }
    });

    const dataDisp = term.onData((data) => {
      send({ type: "input", data });
    });
    const resizeDisp = term.onResize(({ cols: nextCols, rows: nextRows }) => {
      send({ type: "resize", cols: nextCols, rows: nextRows });
    });

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      dataDisp.dispose();
      resizeDisp.dispose();
      termRef.current = null;
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      term.dispose();
    };
  }, [cwd, label, sessionKey]);

  // Tab / Escape from the agent panel focus or blur this session’s terminal.
  useEffect(() => {
    const matches = (event: Event) => {
      if (!activeRef.current) return false;
      const detail = (event as CustomEvent<{ sessionKey?: string | null }>).detail;
      const key = detail?.sessionKey;
      return key == null || key === sessionKey;
    };

    const onFocus = (event: Event) => {
      if (!matches(event)) return;
      termRef.current?.focus();
    };
    const onBlur = (event: Event) => {
      if (!matches(event)) return;
      termRef.current?.blur();
    };

    window.addEventListener(FOCUS_AGENT_TERMINAL_EVENT, onFocus);
    window.addEventListener(BLUR_AGENT_TERMINAL_EVENT, onBlur);
    return () => {
      window.removeEventListener(FOCUS_AGENT_TERMINAL_EVENT, onFocus);
      window.removeEventListener(BLUR_AGENT_TERMINAL_EVENT, onBlur);
    };
  }, [sessionKey]);

  return (
    <div className="agent-surface-pane agent-surface-pane--terminal">
      <div
        ref={hostRef}
        className="agent-surface-terminal-host"
        {...{ [AGENT_SURFACE_FOCUS_ATTR]: AGENT_SURFACE_FOCUS.terminal }}
      />
    </div>
  );
}
