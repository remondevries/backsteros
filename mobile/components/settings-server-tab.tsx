import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  buildPtyWebSocketUrl,
  ensureSystemHerdrShell,
  fetchAgentPtyConnection,
} from "../lib/agent/agent-pty";
import { colors } from "../lib/theme";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { AgentTerminalWebView } from "./agent/agent-terminal-webview";

type PaneStatus = "connecting" | "ready" | "error";

/**
 * iOS Settings → Server: live Herdr TUI on the laptop, focused on the
 * `backster-system` workspace (tabs / panes for setup).
 */
export function SettingsServerTab() {
  const client = useMobileApiClient();
  const [status, setStatus] = useState<PaneStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [connectEpoch, setConnectEpoch] = useState(0);
  const connectingRef = useRef(false);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setStatus("connecting");
    setError(null);
    setConnectUrl(null);

    try {
      const discovered = await fetchAgentPtyConnection(client);
      if (!discovered.ok) {
        setStatus("error");
        setError(discovered.error);
        return;
      }

      const ensured = await ensureSystemHerdrShell(discovered.connection);
      if (!ensured.ok) {
        setStatus("error");
        setError(ensured.error);
        return;
      }

      setConnectUrl(
        buildPtyWebSocketUrl(discovered.connection, {
          sessionId: ensured.sessionId,
          kind: "shell",
          label: ensured.workspaceLabel,
          cols: 80,
          rows: 24,
        }),
      );
      setConnectEpoch((n) => n + 1);
      setStatus("ready");
    } finally {
      connectingRef.current = false;
    }
  }, [client]);

  useEffect(() => {
    void connect();
  }, [connect]);

  if (status === "connecting" && !connectUrl) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.muted} />
        <Text style={styles.hint}>Opening backster-system on the laptop…</Text>
      </View>
    );
  }

  if (status === "error" || !connectUrl) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {error ?? "Could not open the server terminal."}
        </Text>
        <Pressable
          onPress={() => {
            void connect();
          }}
          style={({ pressed }) => [
            styles.retryButton,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Retry server terminal"
        >
          <Text style={styles.retryLabel}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.host}>
      <AgentTerminalWebView
        connectUrl={connectUrl}
        connectEpoch={connectEpoch}
        touchAsMouse
        onError={(message) => {
          setStatus("error");
          setError(message);
          setConnectUrl(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    minHeight: 0,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  centered: {
    flex: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.buttonBg,
  },
  retryLabel: {
    color: colors.buttonText,
    fontWeight: "600",
    fontSize: 15,
  },
});
