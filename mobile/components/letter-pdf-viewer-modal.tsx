import type { BacksterosApiClient } from "@backsteros/api-client";
import { BlurView } from "expo-blur";
import { File, Paths } from "expo-file-system";
import {
  useEffect,
  useState,
  type ComponentType,
  type ReactElement,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TurboModuleRegistry,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useHideTabBar } from "../lib/tab-bar-visibility";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";

type Props = {
  visible: boolean;
  letterId: string;
  client: BacksterosApiClient;
  onClose: () => void;
  /** When set, open this attachment instead of the primary/legacy PDF. */
  attachmentId?: string | null;
};

type WebViewProps = {
  source: { uri: string };
  style?: StyleProp<ViewStyle>;
  originWhitelist?: string[];
  allowFileAccess?: boolean;
  allowingReadAccessToURL?: string;
  startInLoadingState?: boolean;
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

const PdfWebView = loadWebView();

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

async function cacheLetterPdf(
  client: BacksterosApiClient,
  letterId: string,
  attachmentId?: string | null,
): Promise<string> {
  let blob: Blob;
  if (attachmentId) {
    blob = await client.downloadLetterAttachment(letterId, attachmentId);
  } else {
    const { attachments } = await client.listLetterAttachments(letterId);
    const primary = attachments[0];
    blob = primary
      ? await client.downloadLetterAttachment(letterId, primary.id)
      : await client.downloadLetterPdf(letterId);
  }
  const bytes = await blobToBytes(blob);
  const suffix = attachmentId ? `-${attachmentId}` : "";
  const file = new File(Paths.cache, `letter-${letterId}${suffix}.pdf`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

function clearCachedPdf(letterId: string, attachmentId?: string | null) {
  try {
    const suffix = attachmentId ? `-${attachmentId}` : "";
    const file = new File(Paths.cache, `letter-${letterId}${suffix}.pdf`);
    if (file.exists) file.delete();
  } catch {
    // Best-effort discard (Tier D — never keep PDF bytes around).
  }
}

/** Fullscreen in-app letter PDF — fetch on open, discard on close. */
export function LetterPdfViewerModal({
  visible,
  letterId,
  client,
  onClose,
  attachmentId = null,
}: Props) {
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useHideTabBar(visible);

  useEffect(() => {
    if (!visible) {
      setUri(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!PdfWebView) {
      setLoading(false);
      setError(
        "In-app PDF viewing needs a native rebuild. Run: pnpm exec expo run:ios",
      );
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setUri(null);
    void cacheLetterPdf(client, letterId, attachmentId)
      .then((nextUri) => {
        if (!cancelled) setUri(nextUri);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : "Could not load PDF.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearCachedPdf(letterId, attachmentId);
    };
  }, [attachmentId, client, letterId, visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={ui.screen}>
        {loading ? (
          <View style={ui.centered}>
            <ActivityIndicator color={colors.muted} />
          </View>
        ) : error ? (
          <View style={ui.centered}>
            <Text style={[ui.error, { textAlign: "center" }]}>{error}</Text>
          </View>
        ) : uri && PdfWebView ? (
          <PdfWebView
            source={{ uri }}
            style={styles.webview}
            originWhitelist={["*"]}
            allowFileAccess
            allowingReadAccessToURL={uri}
            startInLoadingState
            renderLoading={() => (
              <View style={[ui.centered, StyleSheet.absoluteFillObject]}>
                <ActivityIndicator color={colors.muted} />
              </View>
            )}
          />
        ) : null}

        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Done"
          style={({ pressed }) => [
            styles.doneButton,
            {
              top: Math.max(insets.top, 12) + 4,
              right: 16,
            },
            pressed ? styles.doneButtonPressed : null,
          ]}
        >
          <View style={styles.doneBackdrop} pointerEvents="none">
            <BlurView
              intensity={55}
              tint="systemChromeMaterialDark"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.doneFill} />
            <View style={styles.doneBorder} />
          </View>
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: colors.background,
  },
  doneButton: {
    position: "absolute",
    zIndex: 2,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonPressed: {
    opacity: 0.72,
  },
  doneBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  doneFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 20, 22, 0.45)",
  },
  doneBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  doneLabel: {
    zIndex: 1,
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
});
