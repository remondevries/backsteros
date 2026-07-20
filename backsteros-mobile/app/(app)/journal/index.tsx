import type { Document } from "@backsteros/contracts";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";

import { getMobileEnvironment } from "../../../lib/env";
import {
  formatJournalEntryTitle,
  getTodayJournalDateSlug,
} from "../../../lib/journal";
import { useMobilePowerSync } from "../../../lib/powersync-context";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../../lib/tab-bar-inset";
import {
  TabStackHeader,
  TabStackHeaderPlusButton,
} from "../../../lib/tab-stack-options";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";
import { useLocalQuery } from "../../../lib/use-local-query";
import { useMobileApiClient } from "../../../lib/use-mobile-api-client";

type JournalRow = {
  id: string;
  journal_date: string;
};

const JOURNAL_SQL = `SELECT id, journal_date FROM documents
 WHERE deleted_at IS NULL
   AND type = 'journal'
   AND journal_date IS NOT NULL
 ORDER BY journal_date DESC`;

export default function JournalScreen() {
  const router = useRouter();
  const { apiUrl } = getMobileEnvironment();
  const powerSync = useMobilePowerSync();
  const client = useMobileApiClient();

  const { data: syncedRows, isLoading: syncLoading } =
    useLocalQuery<JournalRow>(JOURNAL_SQL);

  const [restRows, setRestRows] = useState<JournalRow[]>([]);
  const [restError, setRestError] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);
  const [userRefreshing, setUserRefreshing] = useState(false);
  const [isCreatingToday, setIsCreatingToday] = useState(false);
  const [createTodayError, setCreateTodayError] = useState<string | null>(null);

  const useRest = !powerSync.ready;
  const todaySlug = getTodayJournalDateSlug();

  const reloadRest = useCallback(async () => {
    if (powerSync.ready) return;
    setRestLoading(true);
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
    } catch (reason) {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      setRestError(
        /network request failed|failed to fetch|could not connect/i.test(detail)
          ? `Cannot reach API at ${apiUrl}. Is backsteros-api running?`
          : detail,
      );
      setRestRows([]);
    } finally {
      setRestLoading(false);
    }
  }, [apiUrl, client, powerSync.ready]);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const localRows = syncedRows ?? [];
  // Keep REST rows until local data arrives — switching to empty local on
  // ready=true was flashing the list empty (up/down flicker).
  const rows = useMemo(() => {
    if (localRows.length > 0) return localRows;
    if (!powerSync.ready || syncLoading) return restRows;
    return localRows;
  }, [localRows, powerSync.ready, restRows, syncLoading]);

  const loading =
    rows.length === 0 && (useRest ? restLoading : syncLoading);
  const error = useRest && rows.length === 0 ? restError : null;
  const hasTodayEntry = rows.some((row) => row.journal_date === todaySlug);
  const showCreateToday = !loading && !hasTodayEntry;

  const onRefresh = useCallback(async () => {
    setUserRefreshing(true);
    try {
      if (useRest) await reloadRest();
      else await powerSync.retry();
    } finally {
      setUserRefreshing(false);
    }
  }, [powerSync, reloadRest, useRest]);

  const onCreateToday = useCallback(() => {
    if (isCreatingToday) return;
    setIsCreatingToday(true);
    setCreateTodayError(null);
    void (async () => {
      try {
        await client.requestJson(
          `/api/v1/journal/${encodeURIComponent(todaySlug)}`,
        );
        if (useRest) await reloadRest();
        router.push(`/(app)/journal/${todaySlug}`);
      } catch (reason) {
        setCreateTodayError(
          reason instanceof Error
            ? reason.message
            : "Could not open today's journal.",
        );
      } finally {
        setIsCreatingToday(false);
      }
    })();
  }, [client, isCreatingToday, reloadRest, router, todaySlug, useRest]);

  return (
    <>
      <Stack.Screen
        options={{
          header: () => (
            <TabStackHeader
              title="Journal"
              leadingActions={
                showCreateToday ? (
                  <TabStackHeaderPlusButton
                    onPress={onCreateToday}
                    disabled={isCreatingToday}
                    accessibilityLabel="Open today's journal"
                  />
                ) : null
              }
            />
          ),
        }}
      />

      {loading ? (
        <View style={ui.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : error ? (
        <View style={ui.screen}>
          <Text style={ui.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          style={ui.screen}
          data={rows}
          keyExtractor={(item) => item.id}
          refreshing={userRefreshing}
          onRefresh={() => {
            void onRefresh();
          }}
          contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
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
            const title = formatJournalEntryTitle(item.journal_date);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={title}
                onPress={() =>
                  router.push(`/(app)/journal/${item.journal_date}`)
                }
                style={({ pressed }) => [
                  ui.row,
                  pressed ? { backgroundColor: colors.rowPressed } : null,
                ]}
              >
                <Text
                  style={ui.rowTitle}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {title}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </>
  );
}
