import { useEffect, useMemo } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { useLocalQuery } from "./use-local-query";
import { useMobileApiClient } from "./use-mobile-api-client";
import {
  HOME_GLANCE_INBOX_COUNT_SQL,
  HOME_GLANCE_INBOX_INDICATOR_SQL,
  HOME_GLANCE_INBOX_SQL,
  HOME_GLANCE_TODAY_COUNT_SQL,
  HOME_GLANCE_TODAY_SQL,
  mapHomeGlanceInboxIndicatorTone,
  mapHomeGlanceInboxRows,
  mapHomeGlanceInboxTotal,
  mapHomeGlanceTodayRows,
  mapHomeGlanceTodayTotal,
  type HomeGlanceInboxCountRow,
  type HomeGlanceInboxIndicatorRow,
  type HomeGlanceInboxSqlRow,
} from "../widgets/load-home-glance-inbox";
import { refreshHomeGlanceWidget } from "../widgets/refresh-home-glance-widget";

function fingerprintItems(
  total: number,
  items: Array<{
    id: string;
    title: string;
    meta: string;
    icon: string;
    iconColor: string;
    priorityIcon: string;
    priorityIconColor: string;
  }>,
): string {
  return (
    `${total}\n` +
    items
      .map(
        (item) =>
          `${item.id}\u0000${item.title}\u0000${item.meta}\u0000${item.icon}\u0000${item.iconColor}\u0000${item.priorityIcon}\u0000${item.priorityIconColor}`,
      )
      .join("\n")
  );
}

/** Keeps the iOS home glance widget greeting/date + inbox/today/Whoop fresh while the app runs. */
export function useHomeGlanceWidgetRefresh(enabled: boolean) {
  const client = useMobileApiClient();
  const disabledSql = "SELECT id FROM tasks WHERE 0";
  const disabledCountSql = "SELECT 0 AS count WHERE 0";

  const { data: inboxRows } = useLocalQuery<HomeGlanceInboxSqlRow>(
    enabled ? HOME_GLANCE_INBOX_SQL : disabledSql,
  );
  const { data: inboxCountRows } = useLocalQuery<HomeGlanceInboxCountRow>(
    enabled ? HOME_GLANCE_INBOX_COUNT_SQL : disabledCountSql,
  );
  const disabledIndicatorSql =
    "SELECT 0 AS total_count, 0 AS attention_count, 0 AS updated_count WHERE 0";
  const { data: inboxIndicatorRows } =
    useLocalQuery<HomeGlanceInboxIndicatorRow>(
      enabled ? HOME_GLANCE_INBOX_INDICATOR_SQL : disabledIndicatorSql,
    );
  const { data: todayRows } = useLocalQuery<HomeGlanceInboxSqlRow>(
    enabled ? HOME_GLANCE_TODAY_SQL : disabledSql,
  );
  const { data: todayCountRows } = useLocalQuery<HomeGlanceInboxCountRow>(
    enabled ? HOME_GLANCE_TODAY_COUNT_SQL : disabledCountSql,
  );

  const inboxItems = useMemo(
    () => mapHomeGlanceInboxRows(inboxRows ?? []),
    [inboxRows],
  );
  const inboxTotalCount = useMemo(
    () => mapHomeGlanceInboxTotal(inboxCountRows),
    [inboxCountRows],
  );
  const inboxIndicatorTone = useMemo(
    () => mapHomeGlanceInboxIndicatorTone(inboxIndicatorRows),
    [inboxIndicatorRows],
  );
  const todayItems = useMemo(
    () => mapHomeGlanceTodayRows(todayRows ?? []),
    [todayRows],
  );
  const todayTotalCount = useMemo(
    () => mapHomeGlanceTodayTotal(todayCountRows),
    [todayCountRows],
  );

  const dataFingerprint = useMemo(
    () =>
      fingerprintItems(inboxTotalCount, inboxItems) +
      `\nindicator:${inboxIndicatorTone}\n` +
      fingerprintItems(todayTotalCount, todayItems),
    [
      inboxItems,
      inboxTotalCount,
      inboxIndicatorTone,
      todayItems,
      todayTotalCount,
    ],
  );

  useEffect(() => {
    if (!enabled || Platform.OS !== "ios") return;

    void refreshHomeGlanceWidget(
      undefined,
      inboxItems,
      inboxTotalCount,
      todayItems,
      todayTotalCount,
      client,
      inboxIndicatorTone,
    );

    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        void refreshHomeGlanceWidget(
          undefined,
          inboxItems,
          inboxTotalCount,
          todayItems,
          todayTotalCount,
          client,
          inboxIndicatorTone,
        );
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => {
      sub.remove();
    };
  }, [
    enabled,
    client,
    dataFingerprint,
    inboxItems,
    inboxTotalCount,
    inboxIndicatorTone,
    todayItems,
    todayTotalCount,
  ]);
}
