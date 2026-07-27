import { TerminalView, type TerminalViewRef } from "expo-libghostty";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import { useAppleKeyCommand } from "../../lib/apple-key-commands";
import {
  useKeyEventListener,
  type KeyPressEvent,
  type KeyReleaseEvent,
} from "../../lib/key-event";
import { colors } from "../../lib/theme";

type PtyReadyInfo = {
  sessionId: string | null;
  reattached: boolean;
  agentSessionEnded: boolean;
  herdrManaged: boolean;
  lastActivity: "working" | "idle" | null;
};

type Props = {
  /** Full WS URL including token + session params. Null = disconnected. */
  connectUrl: string | null;
  /** Bump to force a reconnect with the same URL. */
  connectEpoch?: number;
  onPtyReady?: (info: {
    sessionId: string | null;
    reattached: boolean;
    agentSessionEnded: boolean;
    herdrManaged: boolean;
    lastActivity: "working" | "idle" | null;
  }) => void;
  onError?: (message: string) => void;
  onActivity?: (activity: string | null, event: string | null) => void;
  /**
   * Fired when the Cursor agent emits assistant reply text
   * (`afterAgentResponse`). Used by the chat transcript view.
   */
  onAssistantMessage?: (text: string) => void;
  onReadyChange?: (ready: boolean) => void;
  /** Imperative write (e.g. agent --resume after pty-ready). */
  writeCommand?: string | null;
  writeEpoch?: number;
  /**
   * When true, map finger taps to xterm SGR mouse reports on the PTY.
   * Used for Herdr TUIs where native Ghostty may not emit onInput for taps.
   */
  touchAsMouse?: boolean;
};

/** xterm SGR mouse: press `M`, release `m`, button 0 = left. Cells are 1-based. */
function sgrMouse(button: number, col: number, row: number, press: boolean): string {
  return `\u001b[<${button};${col};${row}${press ? "M" : "m"}`;
}

function isArrowKeyName(key: string): boolean {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "Up" ||
    key === "Down" ||
    key === "Left" ||
    key === "Right"
  );
}

/** Map hardware key events → PTY bytes (CSI arrows, Ctrl-C, printable, …). */
function keyEventToPtyInput(
  event: KeyPressEvent | KeyReleaseEvent,
): string | null {
  if (event.eventType !== "press") return null;
  const key = event.key;

  if (key === "ArrowUp" || key === "Up") return "\u001b[A";
  if (key === "ArrowDown" || key === "Down") return "\u001b[B";
  if (key === "ArrowRight" || key === "Right") return "\u001b[C";
  if (key === "ArrowLeft" || key === "Left") return "\u001b[D";
  if (key === "Home") return "\u001b[H";
  if (key === "End") return "\u001b[F";
  if (key === "PageUp") return "\u001b[5~";
  if (key === "PageDown") return "\u001b[6~";
  if (key === "Enter" || key === "Return") return "\r";
  if (key === "Backspace" || key === "Delete") return "\x7f";
  if (key === "Escape" || key === "Esc") return "\u001b";
  if (key === "Tab") return "\t";
  if (key === " " || key === "Space" || key === "Spacebar") return " ";

  if (event.ctrlKey) {
    const letter =
      event.character && /^[a-zA-Z]$/.test(event.character)
        ? event.character.toUpperCase()
        : /^Key([A-Z])$/.exec(key)?.[1];
    if (letter) {
      const code = letter.charCodeAt(0) - 64; // Ctrl+A → 1
      if (code >= 1 && code <= 26) return String.fromCharCode(code);
    }
  }

  if (event.character && event.character.length > 0) {
    if (event.character === "\n" || event.character === "\r") return "\r";
    return event.character;
  }

  const keyLetter = /^Key([A-Z])$/.exec(key)?.[1];
  if (keyLetter) {
    return event.shiftKey ? keyLetter : keyLetter.toLowerCase();
  }
  const digit = /^Digit([0-9])$/.exec(key)?.[1];
  if (digit) return digit;
  if (key.length === 1) return key;
  return null;
}

function toBase64Utf8(text: string): string {
  // Prefer base64 `write()` — Ghostty's primary PTY path; handles binary-safe ANSI.
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Live agent TUI: native WebSocket (Tailscale → laptop PTY) + Ghostty Metal
 * terminal. Bytes are painted natively — not via RN WebView / injectJavaScript.
 */
export function AgentTerminalWebView({
  connectUrl,
  connectEpoch = 0,
  writeCommand = null,
  writeEpoch = 0,
  onPtyReady,
  onError,
  onActivity,
  onAssistantMessage,
  onReadyChange,
  touchAsMouse = false,
}: Props) {
  const terminalRef = useRef<TerminalViewRef>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const lastWriteRef = useRef(0);
  const pendingPtyInputRef = useRef<string[]>([]);
  const pendingPaintRef = useRef<string[]>([]);
  const surfaceReadyRef = useRef(false);
  const gridRef = useRef({ cols: 80, rows: 24 });
  const layoutRef = useRef({ width: 0, height: 0 });
  const hiddenInputRef = useRef<TextInput>(null);
  const inputValueRef = useRef("");
  const [surfaceReady, setSurfaceReady] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [softKeyboard, setSoftKeyboard] = useState(false);

  const touchBridgeActive = Boolean(
    touchAsMouse && connectUrl && surfaceReady && socketReady,
  );
  /** Hardware keys via expo-key-event / UIKeyCommand — TextInput steals arrows. */
  const hardwareKeysActive = touchBridgeActive && !softKeyboard;

  const focusHiddenInput = useCallback(() => {
    hiddenInputRef.current?.focus();
  }, []);

  const blurHiddenInput = useCallback(() => {
    hiddenInputRef.current?.blur();
  }, []);

  const sendPtyRef = useRef<(message: Record<string, unknown>) => void>(
    () => {},
  );

  // Keep parent callbacks in refs so the WS effect does not reconnect every render.
  const onPtyReadyRef = useRef(onPtyReady);
  const onErrorRef = useRef(onError);
  const onActivityRef = useRef(onActivity);
  const onAssistantMessageRef = useRef(onAssistantMessage);
  const onReadyChangeRef = useRef(onReadyChange);
  onPtyReadyRef.current = onPtyReady;
  onErrorRef.current = onError;
  onActivityRef.current = onActivity;
  onAssistantMessageRef.current = onAssistantMessage;
  onReadyChangeRef.current = onReadyChange;

  const flushPaint = useCallback(() => {
    if (!surfaceReadyRef.current) return;
    const chunks = pendingPaintRef.current;
    if (chunks.length === 0) return;
    pendingPaintRef.current = [];
    const text = chunks.join("");
    if (!text) return;
    void terminalRef.current
      ?.write(toBase64Utf8(text))
      .catch(() => {
        // Re-queue once if the native view rejected.
        pendingPaintRef.current.unshift(text);
      });
  }, []);

  const paintOutput = useCallback(
    (text: string) => {
      if (!text) return;
      pendingPaintRef.current.push(text);
      flushPaint();
    },
    [flushPaint],
  );

  const sendToPty = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return;
    }
    if (message.type === "input" && typeof message.data === "string") {
      pendingPtyInputRef.current.push(message.data);
    }
  }, []);
  sendPtyRef.current = sendToPty;

  const sendArrow = useCallback((csi: string) => {
    sendPtyRef.current({ type: "input", data: csi });
  }, []);

  const arrowUpCmd = useMemo(
    () => ({
      id: "agent-term-arrow-up",
      input: "up",
      modifiers: [] as Array<"command" | "control" | "option" | "shift">,
      title: "Terminal Up",
    }),
    [],
  );
  const arrowDownCmd = useMemo(
    () => ({
      id: "agent-term-arrow-down",
      input: "down",
      modifiers: [] as Array<"command" | "control" | "option" | "shift">,
      title: "Terminal Down",
    }),
    [],
  );
  const arrowLeftCmd = useMemo(
    () => ({
      id: "agent-term-arrow-left",
      input: "left",
      modifiers: [] as Array<"command" | "control" | "option" | "shift">,
      title: "Terminal Left",
    }),
    [],
  );
  const arrowRightCmd = useMemo(
    () => ({
      id: "agent-term-arrow-right",
      input: "right",
      modifiers: [] as Array<"command" | "control" | "option" | "shift">,
      title: "Terminal Right",
    }),
    [],
  );

  useAppleKeyCommand(
    arrowUpCmd,
    () => sendArrow("\u001b[A"),
    hardwareKeysActive,
  );
  useAppleKeyCommand(
    arrowDownCmd,
    () => sendArrow("\u001b[B"),
    hardwareKeysActive,
  );
  useAppleKeyCommand(
    arrowLeftCmd,
    () => sendArrow("\u001b[D"),
    hardwareKeysActive,
  );
  useAppleKeyCommand(
    arrowRightCmd,
    () => sendArrow("\u001b[C"),
    hardwareKeysActive,
  );

  const onHardwareKeyEvent = useCallback(
    (event: KeyPressEvent | KeyReleaseEvent) => {
      if (!hardwareKeysActive) return;
      if (event.eventType !== "press") return;
      // Arrows: UIKeyCommand path (TextInput / RN onKeyPress never sees them).
      if (isArrowKeyName(event.key)) return;
      const data = keyEventToPtyInput(event);
      if (!data) return;
      sendPtyRef.current({ type: "input", data });
    },
    [hardwareKeysActive],
  );

  useKeyEventListener(onHardwareKeyEvent, {
    listenOnMount: true,
    captureModifiers: true,
  });

  const paintOutputRef = useRef<(text: string) => void>(() => {});
  paintOutputRef.current = paintOutput;

  useEffect(() => {
    onReadyChangeRef.current?.(surfaceReady && socketReady);
  }, [socketReady, surfaceReady]);

  useEffect(() => {
    if (!connectUrl) {
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          /* ignore */
        }
        socketRef.current = null;
      }
      pendingPtyInputRef.current = [];
      pendingPaintRef.current = [];
      setSocketReady(false);
      return;
    }

    pendingPtyInputRef.current = [];
    pendingPaintRef.current = [];
    setSocketReady(false);
    let settled = false;
    let socket: WebSocket;
    try {
      socket = new WebSocket(connectUrl);
    } catch (error) {
      onErrorRef.current?.(
        error instanceof Error
          ? error.message
          : "Could not create WebSocket to PTY.",
      );
      return;
    }
    socketRef.current = socket;

    const readPayload = (data: unknown): string => {
      if (typeof data === "string") return data;
      if (data instanceof ArrayBuffer) {
        return new TextDecoder().decode(data);
      }
      if (ArrayBuffer.isView(data)) {
        return new TextDecoder().decode(data);
      }
      return String(data ?? "");
    };

    socket.onmessage = (event) => {
      let message: {
        type?: string;
        data?: string;
        message?: string;
        sessionId?: string;
        reattached?: boolean;
        agentSessionEnded?: boolean;
        herdrManaged?: boolean;
        lastActivity?: string | null;
        activity?: string | null;
        event?: string;
        text?: string;
        code?: number | null;
      };
      try {
        message = JSON.parse(readPayload(event.data)) as typeof message;
      } catch {
        return;
      }

      if (message.type === "output" && typeof message.data === "string") {
        paintOutputRef.current(message.data);
        return;
      }
      if (message.type === "ready") {
        settled = true;
        setSocketReady(true);
        const lastActivity =
          message.lastActivity === "working" || message.lastActivity === "idle"
            ? message.lastActivity
            : null;
        onPtyReadyRef.current?.({
          sessionId: message.sessionId ?? null,
          reattached: Boolean(message.reattached),
          agentSessionEnded: Boolean(message.agentSessionEnded),
          herdrManaged: Boolean(message.herdrManaged),
          lastActivity,
        });
        const pending = pendingPtyInputRef.current;
        pendingPtyInputRef.current = [];
        for (const data of pending) {
          socket.send(JSON.stringify({ type: "input", data }));
        }
        return;
      }
      if (message.type === "agent-hook") {
        if (
          message.event === "afterAgentResponse" &&
          typeof message.text === "string" &&
          message.text.trim()
        ) {
          onAssistantMessageRef.current?.(message.text.trim());
        }
        onActivityRef.current?.(
          message.activity ?? null,
          message.event ?? null,
        );
        return;
      }
      if (message.type === "exit") {
        paintOutputRef.current(
          `\r\n\x1b[90m[session exited${message.code != null ? ` code=${message.code}` : ""}]\x1b[0m\r\n`,
        );
        try {
          void terminalRef.current?.finish(
            typeof message.code === "number" ? message.code : 0,
          );
        } catch {
          /* ignore */
        }
        return;
      }
      if (message.type === "error" && message.message) {
        paintOutputRef.current(`\r\n\x1b[31m${message.message}\x1b[0m\r\n`);
        onErrorRef.current?.(message.message);
      }
    };

    socket.onerror = () => {
      if (settled) return;
      let host = "PTY host";
      try {
        host = new URL(connectUrl).host;
      } catch {
        /* ignore */
      }
      onErrorRef.current?.(
        `Could not open WebSocket to ${host}. Is Tailscale up, and is \`pnpm pty\` listening with PTY_HOST=0.0.0.0?`,
      );
    };

    socket.onclose = (event) => {
      if (socketRef.current === socket) socketRef.current = null;
      setSocketReady(false);
      if (!settled) {
        let host = "PTY host";
        try {
          host = new URL(connectUrl).host;
        } catch {
          /* ignore */
        }
        onErrorRef.current?.(
          `WebSocket to ${host} closed before ready (code ${event.code}). Check Tailscale and that \`pnpm pty\` is running with PTY_HOST=0.0.0.0.`,
        );
      }
    };

    return () => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [connectEpoch, connectUrl]);

  useEffect(() => {
    if (!writeCommand) return;
    if (lastWriteRef.current === writeEpoch) return;
    lastWriteRef.current = writeEpoch;
    // Keep trailing newlines — the shell needs Enter to run `agent --resume`.
    if (!writeCommand.length) return;
    sendToPty({ type: "input", data: writeCommand });
  }, [sendToPty, writeCommand, writeEpoch]);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const cellFromTouch = useCallback((event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const { width, height } = layoutRef.current;
    const { cols, rows } = gridRef.current;
    if (width < 1 || height < 1) return null;
    const col = Math.min(
      cols,
      Math.max(1, Math.floor(locationX / (width / cols)) + 1),
    );
    const row = Math.min(
      rows,
      Math.max(1, Math.floor(locationY / (height / rows)) + 1),
    );
    return { col, row };
  }, []);

  const onTouchAsMouseGrant = useCallback(
    (event: GestureResponderEvent) => {
      const cell = cellFromTouch(event);
      if (!cell) return;
      sendToPty({
        type: "input",
        data: sgrMouse(0, cell.col, cell.row, true),
      });
    },
    [cellFromTouch, sendToPty],
  );

  const onTouchAsMouseRelease = useCallback(
    (event: GestureResponderEvent) => {
      const cell = cellFromTouch(event);
      if (!cell) return;
      sendToPty({
        type: "input",
        data: sgrMouse(0, cell.col, cell.row, false),
      });
      // Soft keyboard only — keep TextInput unfocused for hardware arrows.
      if (softKeyboard) focusHiddenInput();
    },
    [cellFromTouch, focusHiddenInput, sendToPty, softKeyboard],
  );

  const onRootLayout = useCallback((event: LayoutChangeEvent) => {
    layoutRef.current = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  }, []);

  useEffect(() => {
    if (!touchBridgeActive) return;
    if (softKeyboard) {
      focusHiddenInput();
    } else {
      blurHiddenInput();
      Keyboard.dismiss();
    }
  }, [
    blurHiddenInput,
    focusHiddenInput,
    softKeyboard,
    touchBridgeActive,
  ]);

  const onHiddenInputChange = useCallback(
    (text: string) => {
      const prev = inputValueRef.current;
      if (text.length > prev.length) {
        const chunk = text.slice(prev.length);
        sendToPty({ type: "input", data: chunk });
      } else if (text.length < prev.length) {
        const n = prev.length - text.length;
        sendToPty({ type: "input", data: "\x7f".repeat(n) });
      }
      if (text.length > 128) {
        inputValueRef.current = "";
        setInputValue("");
      } else {
        inputValueRef.current = text;
        setInputValue(text);
      }
    },
    [sendToPty],
  );

  return (
    <View style={styles.root} onLayout={onRootLayout}>
      <TerminalView
        ref={terminalRef}
        style={styles.terminal}
        fontSize={12}
        theme={{
          background: "#0f1115",
          foreground: "#e8e8e8",
          cursorColor: "#e8e8e8",
          selectionBackground: "#264f78",
          selectionForeground: "#e8e8e8",
        }}
        onInput={({ nativeEvent }) => {
          // Prefer base64 — mouse CSI / binary-safe bytes can be mangled via
          // the UTF-8 `text` path. Fall back to text for older natives.
          if (nativeEvent.data) {
            try {
              const decoded = atob(nativeEvent.data);
              sendToPty({ type: "input", data: decoded });
              return;
            } catch {
              /* fall through to text */
            }
          }
          if (nativeEvent.text) {
            sendToPty({ type: "input", data: nativeEvent.text });
          }
        }}
        onResize={({ nativeEvent }) => {
          surfaceReadyRef.current = true;
          setSurfaceReady(true);
          flushPaint();
          const cols = Math.max(2, Math.floor(nativeEvent.cols || 80));
          const rows = Math.max(1, Math.floor(nativeEvent.rows || 24));
          gridRef.current = { cols, rows };
          sendToPty({ type: "resize", cols, rows });
        }}
      />
      {touchBridgeActive ? (
        <>
          <TextInput
            ref={hiddenInputRef}
            value={inputValue}
            onChangeText={onHiddenInputChange}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === "Backspace" && inputValueRef.current.length === 0) {
                sendToPty({ type: "input", data: "\x7f" });
              }
            }}
            onSubmitEditing={() => {
              sendToPty({ type: "input", data: "\r" });
            }}
            showSoftInputOnFocus={softKeyboard}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            blurOnSubmit={false}
            caretHidden
            importantForAutofill="no"
            textContentType="none"
            style={styles.hiddenInput}
          />
          <View
            style={styles.touchMouseLayer}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onTouchAsMouseGrant}
            onResponderRelease={onTouchAsMouseRelease}
            onResponderTerminate={onTouchAsMouseRelease}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              softKeyboard ? "Hide on-screen keyboard" : "Show on-screen keyboard"
            }
            onPress={() => {
              setSoftKeyboard((open) => {
                const next = !open;
                if (!next) Keyboard.dismiss();
                return next;
              });
            }}
            style={({ pressed }) => [
              styles.keyboardToggle,
              softKeyboard ? styles.keyboardToggleActive : null,
              pressed ? { opacity: 0.85 } : null,
            ]}
          >
            <Text style={styles.keyboardToggleLabel}>
              {softKeyboard ? "Kb ▾" : "Kb"}
            </Text>
          </Pressable>
        </>
      ) : null}
      {!connectUrl ? (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayText}>Waiting for PTY connection…</Text>
        </View>
      ) : null}
      {connectUrl && (!surfaceReady || !socketReady) ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#0f1115",
  },
  terminal: {
    flex: 1,
    minHeight: 0,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0.01,
    height: 1,
    width: 1,
    left: 0,
    bottom: 0,
    zIndex: 0,
  },
  touchMouseLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  keyboardToggle: {
    position: "absolute",
    right: 10,
    bottom: 10,
    zIndex: 3,
    minWidth: 40,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,17,21,0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  keyboardToggleActive: {
    borderColor: "rgba(255,255,255,0.45)",
    backgroundColor: "rgba(40,44,52,0.92)",
  },
  keyboardToggleLabel: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "700",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,17,21,0.55)",
    zIndex: 2,
  },
  overlayText: {
    color: colors.muted,
    fontSize: 13,
  },
});
