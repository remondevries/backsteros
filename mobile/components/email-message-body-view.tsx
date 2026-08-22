import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactElement } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TurboModuleRegistry,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  formatEmailSourceSize,
  parseEmailAuthenticationResults,
  type EmailMessageSourceDetail,
} from "../lib/email-message-source";
import {
  buildEmailWebViewDocument,
  emailMessageHtmlBody,
  emailMessagePlainBody,
  isSubstantiveEmailHtml,
  plainTextEmailToHtml,
  prepareEmailHtmlForDisplay,
} from "../lib/email-message-html";
import type { EmailThreadBodyViewMode } from "../lib/email-thread-body-view-mode";
import { colors } from "../lib/theme";

type WebViewMessageEvent = {
  nativeEvent: { data: string };
};

type WebViewProps = {
  source: { html: string };
  style?: StyleProp<ViewStyle>;
  originWhitelist?: string[];
  scrollEnabled?: boolean;
  onMessage?: (event: WebViewMessageEvent) => void;
  setSupportMultipleWindows?: boolean;
  javaScriptEnabled?: boolean;
  renderLoading?: () => ReactElement;
};

function loadWebView(): ComponentType<WebViewProps> | null {
  try {
    // `get` (not `getEnforcing`) returns null when the native module isn't linked.
    if (!TurboModuleRegistry.get("RNCWebViewModule")) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-webview").WebView as ComponentType<WebViewProps>;
  } catch {
    return null;
  }
}

const BodyWebView = loadWebView();

const MIN_BODY_HEIGHT = 48;
const MAX_BODY_HEIGHT = 4000;

export type EmailBodySource = {
  text?: string | null;
  html?: string | null;
  extractedText?: string | null;
  extractedHtml?: string | null;
};

function EmailPlainBody({ text }: { text: string }) {
  return (
    <Text style={styles.plainBody}>
      {text || "(no content)"}
    </Text>
  );
}

function EmailRenderedBody({ html }: { html: string }) {
  const documentHtml = useMemo(
    () => buildEmailWebViewDocument(prepareEmailHtmlForDisplay(html)),
    [html],
  );
  const [height, setHeight] = useState(MIN_BODY_HEIGHT);

  if (!BodyWebView) {
    return <EmailPlainBody text={html.replace(/<[^>]+>/g, " ").trim()} />;
  }

  return (
    <View style={{ height, overflow: "hidden" }}>
      <BodyWebView
        source={{ html: documentHtml }}
        originWhitelist={["*"]}
        scrollEnabled={false}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        style={{ backgroundColor: "transparent", flex: 1 }}
        onMessage={(event) => {
          try {
            const parsed = JSON.parse(event.nativeEvent.data) as {
              type?: string;
              height?: number;
            };
            if (
              parsed.type === "email-body-height" &&
              typeof parsed.height === "number" &&
              Number.isFinite(parsed.height)
            ) {
              setHeight(
                Math.min(
                  MAX_BODY_HEIGHT,
                  Math.max(MIN_BODY_HEIGHT, Math.ceil(parsed.height) + 4),
                ),
              );
            }
          } catch {
            // Ignore non-JSON messages.
          }
        }}
      />
    </View>
  );
}

function EmailSourceBody({
  loadSource,
}: {
  loadSource: () => Promise<EmailMessageSourceDetail>;
}) {
  const [source, setSource] = useState<EmailMessageSourceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    void loadSource()
      .then((detail) => {
        if (fetchSeqRef.current !== seq) return;
        setSource(detail);
      })
      .catch((reason: unknown) => {
        if (fetchSeqRef.current !== seq) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load message source.",
        );
      })
      .finally(() => {
        if (fetchSeqRef.current !== seq) return;
        setLoading(false);
      });
  }, [loadSource]);

  if (loading) {
    return (
      <View style={styles.sourceStatus}>
        <ActivityIndicator color={colors.muted} size="small" />
        <Text style={styles.sourceStatusText}>Loading source…</Text>
      </View>
    );
  }

  if (error) {
    return <Text style={[styles.sourceStatusText, styles.sourceError]}>{error}</Text>;
  }

  if (!source) {
    return <Text style={styles.sourceStatusText}>Source unavailable.</Text>;
  }

  const authChecks = parseEmailAuthenticationResults(source.headers);

  return (
    <View style={styles.sourceRoot}>
      <Text style={styles.sourceMeta}>
        {source.headers.length} header{source.headers.length === 1 ? "" : "s"}
        {" · "}
        {formatEmailSourceSize(source.sizeBytes)}
      </Text>
      <View style={styles.sourceHeaders}>
        {source.headers.map((header, index) => (
          <View key={`${header.name}:${index}`} style={styles.sourceHeaderRow}>
            <Text style={styles.sourceHeaderName}>{header.name}</Text>
            <Text style={styles.sourceHeaderValue} selectable>
              {header.value}
            </Text>
          </View>
        ))}
      </View>
      {authChecks.length > 0 ? (
        <View style={styles.sourceAuth}>
          <Text style={styles.sourceAuthTitle}>Authentication</Text>
          <View style={styles.sourceAuthPills}>
            {authChecks.map((check) => (
              <View
                key={check.method}
                style={[
                  styles.sourceAuthPill,
                  check.pass ? styles.sourceAuthPass : styles.sourceAuthFail,
                ]}
              >
                <Text style={styles.sourceAuthPillLabel}>
                  {check.method} {check.pass ? "✓" : "✕"}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Email message body — plain text, rendered HTML (WebView), or raw source
 * headers (desktop email thread parity).
 */
export function EmailMessageBodyView({
  message,
  viewMode = "plain",
  loadSource,
}: {
  message: EmailBodySource;
  viewMode?: EmailThreadBodyViewMode;
  loadSource?: () => Promise<EmailMessageSourceDetail>;
}) {
  const plain = emailMessagePlainBody(message);
  const renderedHtml = useMemo(() => {
    const htmlBody = emailMessageHtmlBody(message);
    if (htmlBody && isSubstantiveEmailHtml(htmlBody)) return htmlBody;
    if (plain) return plainTextEmailToHtml(plain);
    return "";
  }, [message, plain]);

  if (viewMode === "source") {
    if (!loadSource) {
      return <Text style={styles.sourceStatusText}>Source unavailable.</Text>;
    }
    return <EmailSourceBody loadSource={loadSource} />;
  }

  if (viewMode === "rendered" && renderedHtml) {
    return <EmailRenderedBody html={renderedHtml} />;
  }

  return <EmailPlainBody text={plain} />;
}

const styles = StyleSheet.create({
  plainBody: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
  },
  sourceRoot: {
    gap: 12,
  },
  sourceStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sourceStatusText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sourceError: {
    color: colors.danger,
  },
  sourceMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  sourceHeaders: {
    gap: 10,
  },
  sourceHeaderRow: {
    gap: 2,
  },
  sourceHeaderName: {
    color: "rgba(237, 237, 237, 0.55)",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "lowercase",
  },
  sourceHeaderValue: {
    color: colors.foreground,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Menlo",
  },
  sourceAuth: {
    gap: 8,
    paddingTop: 4,
  },
  sourceAuthTitle: {
    color: "rgba(237, 237, 237, 0.55)",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sourceAuthPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sourceAuthPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceAuthPass: {
    borderColor: "rgba(52, 199, 89, 0.35)",
    backgroundColor: "rgba(52, 199, 89, 0.12)",
  },
  sourceAuthFail: {
    borderColor: "rgba(255, 69, 58, 0.35)",
    backgroundColor: "rgba(255, 69, 58, 0.12)",
  },
  sourceAuthPillLabel: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
});
