import type { Document } from "@backsteros/contracts";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { isPadDevice } from "../lib/device";
import { getMobileEnvironment } from "../lib/env";
import {
  formatJournalEntryTitle,
  formatJournalSidePanelLabel,
  getTodayJournalDateSlug,
} from "../lib/journal";
import { useMobilePowerSync } from "../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { normalizePathname } from "../lib/use-escape-back-navigation";
import { useListJkNavigation } from "../lib/use-list-jk-navigation";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { resolveSyncedOrRestRows } from "../lib/resolve-synced-or-rest-rows";
import { useRestListHydration } from "../lib/use-rest-list-hydration";
import { useRestReloadFlags } from "../lib/use-rest-reload-flags";

export type JournalListRow = {
  id: string;
  journal_date: string;
};

const JOURNAL_SQL = `SELECT id, journal_date FROM documents
 WHERE deleted_at IS NULL
   AND type = 'journal'
   AND journal_date IS NOT NULL
 ORDER BY journal_date DESC`;

/** `/journal/<dateSlug>` → dateSlug / null. */
export function journalSelectedDateFromPathname(
  pathname: string,
): string | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/journal\/([^/]+)$/);
  if (!match?.[1] || match[1] === "new") return null;
  return match[1];
}

type Props = {
  /** Master-detail selection highlight (iPad). */
  selectedDateSlug?: string | null;
  /**
   * When true (iPad split), open today (or first entry) if none selected —
   * desktop journal side-panel parity.
   */
  autoSelectFirst?: boolean;
  /** Override row press (defaults to journal detail navigation). */
  onPressRow?: (row: JournalListRow) => void;
  /** Optional create-today error banner above the list. */
  createTodayError?: string | null;
};

/**
 * Journal entry list — shared by phone full-screen and iPad left pane.
 * Labels match desktop: `YYYY-MM-DD` + optional Today badge.
 */
export function JournalListPane({
  selectedDateSlug = null,
  autoSelectFirst = false,
  onPressRow: onPressRowProp,
  createTodayError = null,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { apiUrl } = getMobileEnvironment();
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();
  const isPad = isPadDevice();

  const pathSelected =
    selectedDateSlug ?? journalSelectedDateFromPathname(pathname);

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<JournalListRow>(JOURNAL_SQL);

  const [restRows, setRestRows] = useState<JournalListRow[] | null>(null);
  const [restError, setRestError] = useState<string | null>(null);
  const {
    restLoading,
    pullRefreshing,
    beginReload,
    endReload,
    markHydrated,
  } = useRestReloadFlags();

  const todaySlug = getTodayJournalDateSlug();
  const localRows = syncedRows ?? [];

  const reloadRest = useCallback(async (opts?: { userPull?: boolean }) => {
    const userPull = beginReload(opts);
    setRestError(null);
    try {
      const body = await client.requestJson<{ documents: Document[] }>(
        "/api/v1/documents?type=journal",
      );
      setRestRows(
        (body.documents ?? [])
          .filter((document) => Boolean(document.journalDate))
          .map((document) => ({
            id: document.id,
            journal_date: document.journalDate as string,
          }))
          .sort((a, b) => b.journal_date.localeCompare(a.journal_date)),
      );
      markHydrated();
    } catch (reason) {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      setRestError(
        /network request failed|failed to fetch|could not connect/i.test(detail)
          ? `Cannot reach API at ${apiUrl}. Is backsteros-api running?`
          : detail,
      );
    } finally {
      endReload(userPull);
    }
  }, [apiUrl, beginReload, client, endReload, markHydrated]);

  useRestListHydration(reloadRest);

  const rows = resolveSyncedOrRestRows({
    localRows,
    restRows,
    connected: powerSync.connected,
  });

  const loading =
    rows.length === 0 &&
    (restLoading ||
      (restRows == null &&
        (powerSync.status === "connecting" ||
          powerSync.status === "idle" ||
          syncLoading)));
  const error =
    rows.length === 0 && restError && !powerSync.connected ? restError : null;

  useEffect(() => {
    if (!autoSelectFirst || !isPad) return;
    if (loading || error) return;
    if (pathSelected) return;
    const normalized = normalizePathname(pathname);
    // Same guard as inbox: list stays mounted under lazy tabs.
    if (!normalized.startsWith("/journal")) return;
    if (normalized !== "/journal" && !normalized.match(/^\/journal\/[^/]+$/)) {
      return;
    }
    const today = rows.find((row) => row.journal_date === todaySlug);
    const first = today ?? rows[0];
    if (!first) return;
    router.replace(`/(app)/journal/${first.journal_date}`);
  }, [
    autoSelectFirst,
    error,
    isPad,
    loading,
    pathSelected,
    pathname,
    router,
    rows,
    todaySlug,
  ]);

  const onPressRow = useCallback(
    (row: JournalListRow) => {
      if (onPressRowProp) {
        onPressRowProp(row);
        return;
      }
      if (isPad) {
        router.replace(`/(app)/journal/${row.journal_date}`);
        return;
      }
      router.push(`/(app)/journal/${row.journal_date}`);
    },
    [isPad, onPressRowProp, router],
  );

  const listRef = useRef<FlatList<JournalListRow>>(null);
  const itemIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { highlightedId } = useListJkNavigation({
    itemIds,
    enabled: !loading && !error,
    onActivate: (id) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) onPressRow(row);
    },
    onHighlightChange: (_id, index) => {
      if (index < 0 || !listRef.current) return;
      try {
        listRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        // Ignore before layout.
      }
    },
  });

  const onRefresh = useCallback(async () => {
    await reloadRest({ userPull: true });
  }, [reloadRest]);

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={ui.screen}>
        <Text style={ui.error}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      style={ui.screen}
      data={rows}
      keyExtractor={(item) => item.id}
      refreshing={pullRefreshing}
      onRefresh={() => {
        void onRefresh();
      }}
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
      onScrollToIndexFailed={() => {}}
      ListHeaderComponent={
        createTodayError ? (
          <Text style={[ui.error, { paddingHorizontal: 16 }]}>
            {createTodayError}
          </Text>
        ) : null
      }
      ListEmptyComponent={
        <Text style={ui.empty}>
          No journal entries yet. Use the plus button for today.
        </Text>
      }
      renderItem={({ item }) => {
        const selected = pathSelected === item.journal_date;
        const highlighted = highlightedId === item.id;
        const isToday = item.journal_date === todaySlug;
        const label = formatJournalSidePanelLabel(item.journal_date);

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isToday
                ? `${formatJournalEntryTitle(item.journal_date)}, Today`
                : formatJournalEntryTitle(item.journal_date)
            }
            onPress={() => onPressRow(item)}
            style={({ pressed }) => [
              styles.row,
              selected ? styles.rowSelected : null,
              highlighted ? ui.keyboardNavHighlight : null,
              pressed ? styles.rowPressed : null,
            ]}
          >
            <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
              {label}
              {isToday ? <Text style={styles.todayBadge}> Today</Text> : null}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 6,
  },
  rowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  rowSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  label: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
  },
  todayBadge: {
    color: "rgba(237, 237, 237, 0.4)",
    fontSize: 11,
    fontWeight: "400",
  },
});
