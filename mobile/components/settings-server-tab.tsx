import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { fetchAgentPtyConnection } from "../lib/agent/agent-pty";
import { colors } from "../lib/theme";
import { useMobileApiClient } from "../lib/use-mobile-api-client";

type PaneStatus = "connecting" | "ready" | "error";

/**
 * iOS Settings → Server: laptop sidecar reachability (ACP agent chat runs on
 * the PTY service; no remote terminal UI is opened from this tab).
 */
export function SettingsServerTab() {
  const client = useMobileApiClient();
  const [status, setStatus] = useState<PaneStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [httpOrigin, setHttpOrigin] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const checkConnection = useCallback(async () => {
    setChecking(true);
    setStatus("connecting");
    setError(null);
    setHttpOrigin(null);

    try {
      const discovered = await fetchAgentPtyConnection(client);
      if (!discovered.ok) {
        setStatus("error");
        setError(discovered.error);
        return;
      }
      setHttpOrigin(discovered.connection.httpOrigin);
      setStatus("ready");
    } finally {
      setChecking(false);
    }
  }, [client]);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  if (status === "connecting" && !httpOrigin) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.muted} />
        <Text style={styles.hint}>Checking laptop agent sidecar…</Text>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {error ?? "Could not reach the agent sidecar on your laptop."}
        </Text>
        <Pressable
          onPress={() => {
            void checkConnection();
          }}
          disabled={checking}
          style={({ pressed }) => [
            styles.retryButton,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Retry sidecar connection"
        >
          <Text style={styles.retryLabel}>
            {checking ? "Retrying…" : "Retry"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.okTitle}>Sidecar reachable</Text>
      {httpOrigin ? (
        <Text style={styles.origin} selectable>
          {httpOrigin}
        </Text>
      ) : null}
      <Text style={styles.hint}>
        Task agents on iPad use Chat only (Cursor ACP on the laptop). Run{" "}
        <Text style={styles.mono}>pnpm --filter @backsteros/desktop pty:tailscale</Text>{" "}
        if connections fail away from home.
      </Text>
      <Pressable
        onPress={() => {
          void checkConnection();
        }}
        disabled={checking}
        style={({ pressed }) => [
          styles.retryButton,
          pressed ? { opacity: 0.85 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Refresh connection status"
      >
        <Text style={styles.retryLabel}>
          {checking ? "Refreshing…" : "Refresh"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  okTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  origin: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    textAlign: "center",
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 12,
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
