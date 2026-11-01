import type { ChatUiMessage } from "@backsteros/contracts";
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
  /**
   * When set, skip the live PTY and statically mirror this chat transcript
   * into the terminal (append-only as messages grow).
   */
  staticSyncMessages?: readonly ChatUiMessage[] | null;
  /** Label used for assistant lines in static sync mode. */
  agentLabel?: string | null;
  /** Label used for user lines in static sync mode (task assignee). */
  userLabel?: string | null;
};

type PtyClientMessage =
  | { type: "ready"; sessionId?: string; cwd?: string }
  | { type: "output"; data: string }
  | { type: "exit"; code: number | null }
  | { type: "error"; message: string };

const TERM_OPTIONS = {
  convertEol: false as const,
  cursorBlink: true,
  fontSize: 12,
  lineHeight: 1.2,
  fontFamily:
    '"JetBrainsMonoNL Nerd Font", "JetBrainsMono Nerd Font", "MesloLGS Nerd Font", "Hack Nerd Font", "Symbols Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  scrollback: 5_000,
  theme: {
    background: "#0A0A0A",
    foreground: "#e8e8e8",
    cursor: "#e8e8e8",
    cursorAccent: "#0A0A0A",
  },
};

function chatMessagePlainText(message: ChatUiMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "tool-call") {
        return `[tool:${part.name ?? "call"} ${part.status ?? "pending"}]`;
      }
      if (part.type === "card") {
        return `[card:${part.cardType}]`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function escapeForTerminal(text: string): string {
  // Strip ESC so agent text cannot inject terminal CSI sequences.
  return text.split(String.fromCharCode(27)).join("");
}

type TerminalBadgeColors = {
  bg: readonly [number, number, number];
  fg: readonly [number, number, number];
};

/** Agent pill — #222 / #747474. */
const AGENT_BADGE_COLORS: TerminalBadgeColors = {
  bg: [34, 34, 34],
  fg: [116, 116, 116],
};

/** Assignee / user pill — orange / black. */
const USER_BADGE_COLORS: TerminalBadgeColors = {
  bg: [245, 158, 11],
  fg: [10, 10, 10],
};

function terminalBadge(
  label: string,
  fallback: string,
  colors: TerminalBadgeColors,
): string {
  const text = escapeForTerminal(label.trim() || fallback);
  const [br, bg, bb] = colors.bg;
  const [fr, fg, fb] = colors.fg;
  return `\x1b[48;2;${br};${bg};${bb}m\x1b[38;2;${fr};${fg};${fb}m ${text} \x1b[0m`;
}

function formatSyncedChatLine(
  message: ChatUiMessage,
  agentLabel: string,
  userLabel: string,
): string {
  const body = escapeForTerminal(chatMessagePlainText(message));
  if (!body) return "";
  const role =
    message.role === "user"
      ? terminalBadge(userLabel, "you", USER_BADGE_COLORS)
      : message.role === "system"
        ? "\x1b[2msystem\x1b[0m"
        : terminalBadge(agentLabel, "agent", AGENT_BADGE_COLORS);
  const lines = body.split(/\r?\n/);
  return lines.map((line) => `${role}  ${line}\r\n`).join("");
}

/**
 * Plain interactive shell (xterm.js ↔ local PTY sidecar), or a static
 * chat→terminal mirror when `staticSyncMessages` is provided.
 */
export function TaskShellTerminal({
  active,
  taskId,
  cwd,
  staticSyncMessages = null,
  agentLabel = null,
  userLabel = null,
}: TaskShellTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const writtenIdsRef = useRef<Set<string>>(new Set());
  const syncMessagesRef = useRef(staticSyncMessages);
  const agentLabelRef = useRef(agentLabel);
  const userLabelRef = useRef(userLabel);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staticTermEpoch, setStaticTermEpoch] = useState(0);
  const staticMode = staticSyncMessages != null;
  const resolvedAgentLabel = agentLabel?.trim() || "agent";
  const resolvedUserLabel = userLabel?.trim() || "you";
  syncMessagesRef.current = staticSyncMessages;
  agentLabelRef.current = agentLabel;
  userLabelRef.current = userLabel;

  // Live PTY session (skipped when statically syncing a chat transcript).
  useEffect(() => {
    if (!active || staticMode) {
      if (!active) {
        setStatus(null);
        setError(null);
      }
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
      termRef.current = null;
    };

    void (async () => {
      setError(null);
      setStatus("Starting terminal…");

      term = new Terminal(TERM_OPTIONS);
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();
      termRef.current = term;

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
        let message: PtyClientMessage;
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
  }, [active, cwd, taskId, staticMode]);

  // Static chat → terminal mirror (Setup session, etc.).
  useEffect(() => {
    if (!active || !staticMode) {
      writtenIdsRef.current.clear();
      if (!active) {
        setStatus(null);
        setError(null);
      }
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let fit: FitAddon | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let onWindowResize: (() => void) | null = null;

    setError(null);
    setStatus(null);
    writtenIdsRef.current.clear();

    const term = new Terminal({
      ...TERM_OPTIONS,
      disableStdin: true,
      cursorBlink: false,
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;

    term.writeln("\x1b[2m── synced chat session ──\x1b[0m");
    term.writeln("");

    const agent = agentLabelRef.current?.trim() || "agent";
    const user = userLabelRef.current?.trim() || "you";
    for (const message of syncMessagesRef.current ?? []) {
      if (writtenIdsRef.current.has(message.id)) continue;
      const chunk = formatSyncedChatLine(message, agent, user);
      writtenIdsRef.current.add(message.id);
      if (!chunk) continue;
      term.write(chunk);
      term.write("\r\n");
    }
    setStaticTermEpoch((value) => value + 1);

    const notifyResize = () => {
      if (!fit || cancelled) return;
      fit.fit();
    };
    onWindowResize = notifyResize;
    resizeObserver = new ResizeObserver(() => {
      notifyResize();
    });
    resizeObserver.observe(host);
    window.addEventListener("resize", notifyResize);

    const writtenIds = writtenIdsRef.current;
    return () => {
      cancelled = true;
      if (onWindowResize) {
        window.removeEventListener("resize", onWindowResize);
      }
      resizeObserver?.disconnect();
      try {
        fit?.dispose();
      } catch {
        /* ignore */
      }
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
      if (termRef.current === term) {
        termRef.current = null;
      }
      writtenIds.clear();
      host.replaceChildren();
    };
  }, [active, staticMode, taskId]);

  useEffect(() => {
    if (!active || !staticMode || !staticSyncMessages) return;
    const term = termRef.current;
    if (!term) return;

    for (const message of staticSyncMessages) {
      if (writtenIdsRef.current.has(message.id)) continue;
      const chunk = formatSyncedChatLine(
        message,
        resolvedAgentLabel,
        resolvedUserLabel,
      );
      writtenIdsRef.current.add(message.id);
      if (!chunk) continue;
      term.write(chunk);
      term.write("\r\n");
    }
  }, [
    active,
    staticMode,
    staticSyncMessages,
    resolvedAgentLabel,
    resolvedUserLabel,
    staticTermEpoch,
  ]);

  if (!active) return null;

  return (
    <div
      className={[
        "task-shell-terminal",
        staticMode ? "task-shell-terminal--static-sync" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={staticMode ? "Synced chat terminal" : "Task terminal"}
    >
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
