import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TurboModuleRegistry,
  View,
} from "react-native";

import { CODEMIRROR_EDITOR_HTML } from "../../lib/generated/codemirror-editor-html";
import { colors } from "../../lib/theme";

type WebViewMessageEvent = {
  nativeEvent: { data: string };
};

type WebViewHandle = {
  injectJavaScript?: (script: string) => void;
  postMessage?: (message: string) => void;
};

type WebViewProps = {
  ref?: { current: WebViewHandle | null } | ((instance: WebViewHandle | null) => void);
  source: { html: string; baseUrl?: string };
  style?: object;
  originWhitelist?: string[];
  onMessage?: (event: WebViewMessageEvent) => void;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  keyboardDisplayRequiresUserAction?: boolean;
  hideKeyboardAccessoryView?: boolean;
  mixedContentMode?: "always" | "never" | "compatibility";
  setSupportMultipleWindows?: boolean;
};

function loadWebView(): ComponentType<WebViewProps> | null {
  try {
    if (!TurboModuleRegistry.get("RNCWebViewModule")) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-webview").WebView as ComponentType<WebViewProps>;
  } catch {
    return null;
  }
}

const EditorWebView = loadWebView();

export type CodemirrorHostToEditor =
  | { type: "setDocument"; path: string; content: string; readOnly?: boolean }
  | { type: "markClean"; path: string; content: string }
  | { type: "focus" };

export type CodemirrorEditorToHost =
  | { type: "ready" }
  | { type: "change"; path: string; content: string; dirty: boolean }
  | { type: "saveRequest"; path: string };

type Props = {
  path: string;
  /** Document body pushed into CM when path/epoch changes. */
  content: string;
  /**
   * Bump when the host wants to re-seed the editor for the same path
   * (e.g. after reload from disk). Do not bump on every keystroke.
   */
  contentEpoch: number;
  readOnly?: boolean;
  /** After a successful save, bump to tell CM the buffer is clean. */
  cleanEpoch?: number;
  cleanContent?: string;
  onChange?: (path: string, content: string, dirty: boolean) => void;
  onSaveRequest?: (path: string) => void;
  onReadyChange?: (ready: boolean) => void;
};

/**
 * WebView host for the bundled CodeMirror 6 file editor.
 * Posts JSON messages matching the editor bridge protocol.
 */
export function CodemirrorFileWebView({
  path,
  content,
  contentEpoch,
  readOnly = false,
  cleanEpoch = 0,
  cleanContent,
  onChange,
  onSaveRequest,
  onReadyChange,
}: Props) {
  const webRef = useRef<WebViewHandle | null>(null);
  const [ready, setReady] = useState(false);
  const lastSeedRef = useRef<string | null>(null);
  const lastCleanRef = useRef(0);

  const send = useCallback((message: CodemirrorHostToEditor) => {
    const payload = JSON.stringify(message);
    const web = webRef.current;
    if (!web) return;
    if (typeof web.injectJavaScript === "function") {
      const script = `(function(){try{window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(payload)}}));}catch(e){} true;})();`;
      web.injectJavaScript(script);
      return;
    }
    web.postMessage?.(payload);
  }, []);

  useEffect(() => {
    onReadyChange?.(ready);
  }, [onReadyChange, ready]);

  useEffect(() => {
    if (!ready) return;
    const seedKey = `${path}\0${contentEpoch}\0${readOnly ? "1" : "0"}`;
    if (lastSeedRef.current === seedKey) return;
    lastSeedRef.current = seedKey;
    send({ type: "setDocument", path, content, readOnly });
  }, [content, contentEpoch, path, readOnly, ready, send]);

  useEffect(() => {
    if (!ready || cleanEpoch === 0 || cleanEpoch === lastCleanRef.current) {
      return;
    }
    lastCleanRef.current = cleanEpoch;
    send({
      type: "markClean",
      path,
      content: cleanContent ?? content,
    });
  }, [cleanContent, cleanEpoch, content, path, ready, send]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: CodemirrorEditorToHost | null = null;
      try {
        data = JSON.parse(event.nativeEvent.data) as CodemirrorEditorToHost;
      } catch {
        return;
      }
      if (!data || typeof data !== "object" || !("type" in data)) return;

      if (data.type === "ready") {
        setReady(true);
        return;
      }
      if (data.type === "change") {
        onChange?.(data.path, data.content, data.dirty);
        return;
      }
      if (data.type === "saveRequest") {
        onSaveRequest?.(data.path);
      }
    },
    [onChange, onSaveRequest],
  );

  if (!EditorWebView) {
    return <View style={styles.fallback} />;
  }

  return (
    <View style={styles.root}>
      {!ready ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : null}
      <EditorWebView
        ref={webRef}
        source={{
          html: CODEMIRROR_EDITOR_HTML,
          baseUrl: "https://backsteros.local/",
        }}
        style={styles.web}
        originWhitelist={["*"]}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        setSupportMultipleWindows={false}
        mixedContentMode="always"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  web: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    backgroundColor: colors.background,
  },
  fallback: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
