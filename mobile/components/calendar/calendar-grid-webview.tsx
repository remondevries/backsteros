import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { ActivityIndicator, StyleSheet, TurboModuleRegistry, View } from "react-native";

import type { CalendarViewMode } from "../../lib/calendar/calendar-view-modes";
import { calendarViewModeToFcView } from "../../lib/calendar/calendar-view-modes";
import { CALENDAR_GRID_HTML } from "../../lib/generated/calendar-grid-html";
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
  allowsInlineMediaPlayback?: boolean;
  mixedContentMode?: "always" | "never" | "compatibility";
};

const CalendarWebView = (() => {
  try {
    if (!TurboModuleRegistry.get("RNCWebViewModule")) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-webview").WebView as ComponentType<WebViewProps>;
  } catch {
    return null;
  }
})();

export type CalendarGridHostMessage =
  | { type: "ready" }
  | {
      type: "eventClick";
      taskId?: string;
      meetingId?: string;
      contactId?: string;
      eventId: string;
    }
  | {
      type: "eventChange";
      entityType: "task" | "meeting";
      entityId: string;
      start: string;
      end: string | null;
      allDay: boolean;
    }
  | { type: "select"; start: string; end: string; allDay: boolean }
  | {
      type: "datesSet";
      title: string;
      start: string;
      end: string;
      viewType: string;
    };

type GridCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  classNames?: string[];
  extendedProps?: Record<string, unknown>;
};

type Props = {
  events: readonly GridCalendarEvent[];
  viewMode: CalendarViewMode;
  selectedDate: Date;
  editable?: boolean;
  onMessage?: (message: CalendarGridHostMessage) => void;
  onReadyChange?: (ready: boolean) => void;
};

export function CalendarGridWebView({
  events,
  viewMode,
  selectedDate,
  editable = true,
  onMessage,
  onReadyChange,
}: Props) {
  const webRef = useRef<WebViewHandle | null>(null);
  const [ready, setReady] = useState(false);

  const send = useCallback((message: Record<string, unknown>) => {
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
    send({
      type: "init",
      events,
      viewMode,
      selectedDate: selectedDate.toISOString(),
      editable,
    });
  }, [editable, events, ready, selectedDate, send, viewMode]);

  useEffect(() => {
    if (!ready) return;
    send({ type: "changeView", viewMode });
  }, [ready, send, viewMode]);

  useEffect(() => {
    if (!ready) return;
    send({ type: "gotoDate", date: selectedDate.toISOString() });
  }, [ready, selectedDate, send]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data) as CalendarGridHostMessage;
        if (message.type === "ready") {
          setReady(true);
        }
        onMessage?.(message);
      } catch {
        // ignore malformed bridge messages
      }
    },
    [onMessage],
  );

  if (!CalendarWebView) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <CalendarWebView
      ref={webRef}
      source={{ html: CALENDAR_GRID_HTML, baseUrl: "https://backsteros.local/" }}
      style={styles.webview}
      originWhitelist={["*"]}
      onMessage={handleMessage}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mixedContentMode="always"
    />
  );
}

export function calendarGridFcViewType(viewMode: CalendarViewMode): string {
  return calendarViewModeToFcView(viewMode);
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
