import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";

import { mintTaskShellSession } from "../lib/task-shell-pty";

import "@xterm/xterm/css/xterm.css";

export type TaskShellTerminalProps = {
  /** When false, the session is torn down (panel collapsed or another tab). */
  active: boolean;
  taskId: string;
  cwd: string | null;
};

type PtyClientMessage =
  | { type: "ready"; sessionId?: string; cwd?: string }
  | { type: "output"; data: string }
  | { type: "exit"; code: number | null }
  | { type: "error"; message: string };

/**
 * Plain interactive shell (xterm.js ↔ local PTY sidecar). No agent attach,
 * no scrollback persistence across close — unmount / deactivate kills the PTY.
 */
export function TaskShellTerminal({
  active,
  taskId,
  cwd,
}: TaskShellTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setStatus(null);
      setError(null);
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let term: Terminal | null = null;
    let fit: FitAddon | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let onWindowResize: (() => void) | null = null;
    let killSent = false;

    const sendKill = () => {
      if (killSent) return;
      killSent = true;
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: "kill" }));
        } catch {
          /* ignore */
        }
      }
    };

    const disposeTerminal = () => {
      try {
        fit?.dispose();
      } catch {
        /* ignore */
      }
      fit = null;
      try {
        term?.dispose();
      } catch {
        /* ignore */
      }
      term = null;
    };

    void (async () => {
      setError(null);
      setStatus("Starting terminal…");

      term = new Terminal({
        convertEol: false,
        cursorBlink: true,
        fontSize: 12,
        lineHeight: 1.2,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        scrollback: 5_000,
        theme: {
          background: "#0f1115",
          foreground: "#e8e8e8",
          cursor: "#e8e8e8",
          cursorAccent: "#0f1115",
        },
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();

      const cols = Math.max(2, term.cols || 80);
      const rows = Math.max(1, term.rows || 24);

      const minted = await mintTaskShellSession({
        cwd,
        taskId,
        cols,
        rows,
      });
      if (cancelled) {
        disposeTerminal();
        return;
      }
      if (!minted.ok) {
        setStatus(null);
        setError(minted.error);
        disposeTerminal();
        return;
      }

      setStatus(`Connecting… (${minted.session.cwd})`);

      try {
        socket = new WebSocket(minted.session.wsUrl);
      } catch (err) {
        setStatus(null);
        setError(
          err instanceof Error ? err.message : "Could not open WebSocket.",
        );
        disposeTerminal();
        return;
      }

      socket.addEventListener("open", () => {
        if (cancelled) {
          sendKill();
          socket?.close();
          return;
        }
        setStatus(null);
        term?.focus();
        if (fit && term && socket?.readyState === WebSocket.OPEN) {
          fit.fit();
          socket.send(
            JSON.stringify({
              type: "resize",
              cols: Math.max(2, term.cols || 80),
              rows: Math.max(1, term.rows || 24),
            }),
          );
        }
      });

      socket.addEventListener("message", (event) => {
        let message: PtyClientMessage | null = null;
        try {
          message = JSON.parse(String(event.data)) as PtyClientMessage;
        } catch {
          return;
        }
        if (!message || typeof message !== "object") return;
        if (message.type === "output" && typeof message.data === "string") {
          term?.write(message.data);
          return;
        }
        if (message.type === "ready") {
          setStatus(null);
          return;
        }
        if (message.type === "error" && typeof message.message === "string") {
          setError(message.message);
          return;
        }
        if (message.type === "exit") {
          setStatus(
            `Shell exited${message.code != null ? ` (${message.code})` : ""}.`,
          );
        }
      });

      socket.addEventListener("close", () => {
        if (!cancelled) {
          setStatus((current) => current ?? "Terminal disconnected.");
        }
      });

      socket.addEventListener("error", () => {
        if (!cancelled) {
          setError(
            "Terminal WebSocket failed. Is `pnpm --filter @backsteros/desktop pty` running?",
          );
        }
      });

      term.onData((data) => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "input", data }));
        }
      });

      const notifyResize = () => {
        if (!fit || !term || socket?.readyState !== WebSocket.OPEN) return;
        fit.fit();
        socket.send(
          JSON.stringify({
            type: "resize",
            cols: Math.max(2, term.cols || 80),
            rows: Math.max(1, term.rows || 24),
          }),
        );
      };

      onWindowResize = notifyResize;
      resizeObserver = new ResizeObserver(() => {
        notifyResize();
      });
      resizeObserver.observe(host);
      window.addEventListener("resize", notifyResize);
    })();

    return () => {
      cancelled = true;
      sendKill();
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
      socket = null;
      if (onWindowResize) {
        window.removeEventListener("resize", onWindowResize);
        onWindowResize = null;
      }
      resizeObserver?.disconnect();
      resizeObserver = null;
      disposeTerminal();
      host.replaceChildren();
    };
  }, [active, cwd, taskId]);

  if (!active) return null;

  return (
    <div className="task-shell-terminal" aria-label="Task terminal">
      {error ? (
        <p className="task-shell-terminal__error" role="alert">
          {error}
        </p>
      ) : null}
      {status && !error ? (
        <p className="task-shell-terminal__status">{status}</p>
      ) : null}
      <div ref={hostRef} className="task-shell-terminal__host" />
    </div>
  );
}
