import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TurboModuleRegistry,
  View,
} from "react-native";

import { colors } from "../../../lib/theme";

type WebViewNavState = { url?: string; title?: string };
type WebViewHandle = { injectJavaScript?: (script: string) => void };
type WebViewProps = {
  ref?: { current: WebViewHandle | null } | ((instance: WebViewHandle | null) => void);
  source: { uri: string };
  style?: object;
  onNavigationStateChange?: (nav: WebViewNavState) => void;
  onError?: () => void;
  onHttpError?: () => void;
};

function loadWebView(): ComponentType<WebViewProps> | null {
  try {
    if (!TurboModuleRegistry.get("RNCWebViewModule")) return null;
    return require("react-native-webview").WebView as ComponentType<WebViewProps>;
  } catch {
    return null;
  }
}

const BrowserWebView = loadWebView();

function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (
    /^localhost(:\d+)?(\/|$)/i.test(trimmed) ||
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(trimmed)
  ) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

type Props = {
  initialUrl?: string | null;
  onUrlChange?: (url: string, title: string) => void;
};

/**
 * In-app browser surface — URL chrome + WebView (desktop Browser parity).
 */
export function AgentSurfaceBrowserPane({
  initialUrl = null,
  onUrlChange,
}: Props) {
  const [draft, setDraft] = useState(initialUrl?.trim() || "https://");
  const [uri, setUri] = useState(() => {
    const normalized = normalizeBrowserUrl(initialUrl ?? "");
    return normalized || "";
  });
  const [title, setTitle] = useState("Browser");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialUrl?.trim()) return;
    const normalized = normalizeBrowserUrl(initialUrl);
    if (!normalized) return;
    setDraft(normalized);
    setUri(normalized);
  }, [initialUrl]);

  const go = useCallback(() => {
    const next = normalizeBrowserUrl(draft);
    if (!next) return;
    if (!/^https?:\/\//i.test(next)) {
      void Linking.openURL(next).catch(() => undefined);
      return;
    }
    setUri(next);
    setDraft(next);
    setLoading(true);
    onUrlChange?.(next, title);
  }, [draft, onUrlChange, title]);

  const chrome = useMemo(
    () => (
      <View style={styles.chrome}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={go}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          placeholder="Enter a URL"
          placeholderTextColor={colors.muted}
          style={styles.address}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go"
          onPress={go}
          style={({ pressed }) => [
            styles.goButton,
            pressed ? { opacity: 0.55 } : null,
          ]}
        >
          <Text style={styles.goLabel}>Go</Text>
        </Pressable>
      </View>
    ),
    [draft, go],
  );

  if (!uri) {
    return (
      <View style={styles.root}>
        {chrome}
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Browser</Text>
          <Text style={styles.emptyBody}>
            Enter a URL to open a local app or site.
          </Text>
        </View>
      </View>
    );
  }

  if (!BrowserWebView) {
    return (
      <View style={styles.root}>
        {chrome}
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>WebView unavailable</Text>
          <Text style={styles.emptyBody}>
            Open in the system browser instead.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openURL(uri)}
            style={styles.linkButton}
          >
            <Text style={styles.linkLabel}>Open externally</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {chrome}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : null}
      <BrowserWebView
        source={{ uri }}
        style={styles.webview}
        onNavigationStateChange={(nav) => {
          setLoading(false);
          if (nav.url) {
            setDraft(nav.url);
            setUri(nav.url);
          }
          if (nav.title) setTitle(nav.title);
          if (nav.url) onUrlChange?.(nav.url, nav.title ?? "Browser");
        }}
        onError={() => setLoading(false)}
        onHttpError={() => setLoading(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  chrome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  address: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  goButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  goLabel: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
  },
  webview: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: "center",
    paddingTop: 12,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  linkButton: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  linkLabel: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
});
