import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCalendarTimeZone } from "../lib/calendar-timezone";
import {
  asContentVersion,
  DocumentContentEmptyBodyRejectedError,
  fetchDocumentContent,
  saveDocumentContent,
} from "../lib/document-content";
import { ensureJournalDocumentViaApi } from "../lib/document-create";
import { isPadDevice } from "../lib/device";
import { taskDetailHref } from "../lib/detail-href";
import { recordHabitDay } from "../lib/habits/api";
import { formatJournalEntryTitle } from "../lib/journal";
import {
  getJournalDisplayBody,
  mergeJournalContent,
} from "../lib/journal-content";
import { withDisplayId } from "../lib/map-task-row";
import {
  formatMobileUserFacingError,
  isMobileApiNetworkError,
} from "../lib/probe-core-health";
import { useMobilePowerSync } from "../lib/powersync-context";
import { floatingComposeOverlayInsets } from "../lib/tab-bar-inset";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { filterTasksDueOnJournalDate } from "../lib/task-due-date";
import { TASK_LIST_SELECT } from "../lib/task-list-query";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { ContentPageTitle } from "./content-page-title";
import { GroupedTaskList, type GroupedTaskRow } from "./grouped-task-list";
import { collapseHabitItemsByHabitId } from "./tasks-today-habits-chips";
import type { JournalHabitDayItem } from "./journal-habits-section";
import {
  countHabitDayOutcomes,
  JournalHabitsList,
} from "./journal-habits-section";
import { JournalWhoopLeading, useWhoopDaySnapshot } from "./journal-whoop-leading";
import { JournalMarkdownBody } from "./journal-markdown-body";
import { SegmentedPillToggle } from "./segmented-pill-toggle";
import { TextInput } from "./app-text-input";
import { toggleMarkdownTaskListItem } from "../lib/markdown-task-list";

type JournalDayListMode = "tasks" | "habits";
type JournalBodyViewMode = "edit" | "preview";

const JOURNAL_DAY_LIST_OPTIONS = [
  { value: "tasks" as const, label: "Tasks" },
  { value: "habits" as const, label: "Habits" },
] as const;

const JOURNAL_BODY_VIEW_OPTIONS = [
  { value: "edit" as const, label: "Edit" },
  { value: "preview" as const, label: "Preview" },
] as const;

type SyncedTaskRow = GroupedTaskRow & {
  number?: number | null;
  project_id?: string | null;
  contact_id?: string | null;
  project_key?: string | null;
  habit_id?: string | null;
};

type SyncedHabitRow = {
  id: string;
  title: string | null;
  icon: string | null;
  sort_order: number | null;
};

type JournalDocRow = {
  id: string;
  journal_date: string;
  snippet: string | null;
  content_version: number | null;
};

type Props = {
  dateSlug: string;
};

/** Title → markdown body → due-tasks list (desktop journal layout). */
const JOURNAL_DOC_SQL = `SELECT id, journal_date, snippet, content_version FROM documents
 WHERE deleted_at IS NULL
   AND type = 'journal'
   AND journal_date = ?
 LIMIT 1`;

const HABITS_META_SQL = `SELECT id, title, icon, sort_order FROM habits
 WHERE deleted_at IS NULL`;

export function JournalDetailScreen({ dateSlug }: Props) {
  const router = useRouter();
  const segments = useSegments();
  const title = formatJournalEntryTitle(dateSlug);
  const calendarTimeZone = useCalendarTimeZone();
  const powerSync = useMobilePowerSync();
  const isPad = isPadDevice();
  const inPadJournalSplit =
    isPad && (segments as string[]).includes("journal");
  const { width: windowWidth } = useWindowDimensions();
  const safeInsets = useSafeAreaInsets();

  const client = useMobileApiClient();
  const whoop = useWhoopDaySnapshot(dateSlug);

  const { data: syncedDocs, isLoading: docSyncLoading } =
    useLocalQuery<JournalDocRow>(JOURNAL_DOC_SQL, [dateSlug]);
  const localDocId = syncedDocs?.[0]?.id ?? null;
  const localSnippet = syncedDocs?.[0]?.snippet ?? null;
  const syncedContentVersion = asContentVersion(
    syncedDocs?.[0]?.content_version,
  );

  const [restDocId, setRestDocId] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState<number | null>(null);
  const [bodyLoading, setBodyLoading] = useState(true);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [bodyViewMode, setBodyViewMode] =
    useState<JournalBodyViewMode>("edit");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const documentId = localDocId ?? restDocId;

  // Resolve document id via journal ensure endpoint when not in local SQLite.
  useEffect(() => {
    if (localDocId) {
      setRestDocId(null);
      return;
    }
    // Wait for local query before hitting ensure — avoids racing an empty SQLite.
    if (powerSync.ready && docSyncLoading) return;

    let cancelled = false;
    void ensureJournalDocumentViaApi(client, dateSlug)
      .then((document) => {
        if (!cancelled) setRestDocId(document.id);
      })
      .catch((reason) => {
        if (cancelled) return;
        setRestDocId(null);
        setBodyLoading(false);
        const message =
          reason instanceof Error ? reason.message : String(reason);
        if (isMobileApiNetworkError(message)) {
          // Offline without a local doc — keep the day usable (tasks still show).
          setBodyError(null);
          setBody(getJournalDisplayBody("", dateSlug, title));
          return;
        }
        setBodyError(
          formatMobileUserFacingError(
            reason,
            "Could not open journal entry.",
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [client, dateSlug, docSyncLoading, localDocId, powerSync.ready, title]);

  // Tier D: fetch markdown body on open (never bulk-synced).
  useEffect(() => {
    if (!documentId) {
      // Still resolving id — keep spinner only until ensure/local settles.
      if (!bodyError) setBodyLoading(true);
      return;
    }

    let cancelled = false;
    setBodyLoading(true);
    setBodyError(null);
    void fetchDocumentContent(client, documentId)
      .then((result) => {
        if (cancelled) return;
        setBody(getJournalDisplayBody(result.content ?? "", dateSlug, title));
        setContentVersion(result.contentVersion);
      })
      .catch((reason) => {
        if (cancelled) return;
        const message =
          reason instanceof Error ? reason.message : String(reason);
        if (isMobileApiNetworkError(message)) {
          // Prefer synced snippet over Expo fetch noise while offline.
          setBody(
            getJournalDisplayBody(localSnippet ?? "", dateSlug, title),
          );
          setBodyError(null);
          return;
        }
        setBody(null);
        setBodyError(
          formatMobileUserFacingError(
            reason,
            "Could not load journal entry.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setBodyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, dateSlug, documentId, localSnippet, title]);

  // Remote save bumped content_version in PowerSync — refetch Tier D body.
  useEffect(() => {
    if (!documentId) return;
    if (syncedContentVersion == null || contentVersion == null) return;
    if (syncedContentVersion <= contentVersion) return;

    let cancelled = false;
    setBodyLoading(true);
    void fetchDocumentContent(client, documentId)
      .then((result) => {
        if (cancelled) return;
        setBody(getJournalDisplayBody(result.content ?? "", dateSlug, title));
        setContentVersion(result.contentVersion);
      })
      .catch((reason) => {
        if (cancelled) return;
        const message =
          reason instanceof Error ? reason.message : String(reason);
        if (isMobileApiNetworkError(message)) {
          // Keep current body; sync will catch up when online.
          return;
        }
        setBodyError(
          formatMobileUserFacingError(
            reason,
            "Could not refresh journal entry.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setBodyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    client,
    contentVersion,
    dateSlug,
    documentId,
    syncedContentVersion,
    title,
  ]);

  const tasksSql = `${TASK_LIST_SELECT}
     WHERE t.deleted_at IS NULL
       AND t.due_date IS NOT NULL
     ORDER BY t.sort_order ASC, t.updated_at DESC`;

  const { data: syncedTasks } = useLocalQuery<SyncedTaskRow>(tasksSql);
  const { data: syncedHabits } = useLocalQuery<SyncedHabitRow>(HABITS_META_SQL);

  const dueTasks = useMemo(
    () =>
      filterTasksDueOnJournalDate(
        (syncedTasks ?? []).map((row) => withDisplayId(row)),
        dateSlug,
        calendarTimeZone,
      ),
    [calendarTimeZone, dateSlug, syncedTasks],
  );

  const [listMode, setListMode] = useState<JournalDayListMode>("tasks");
  const [habitCheckedOverride, setHabitCheckedOverride] = useState<
    Partial<Record<string, boolean>>
  >({});

  useEffect(() => {
    setHabitCheckedOverride({});
    setListMode("tasks");
  }, [dateSlug]);

  const habitItems = useMemo((): JournalHabitDayItem[] => {
    const habitById = new Map(
      (syncedHabits ?? []).map((habit) => [habit.id, habit] as const),
    );
    const allHabitTasks = (syncedTasks ?? []).filter((row) =>
      Boolean(row.habit_id && String(row.habit_id).trim()),
    );
    const mapped = dueTasks
      .filter((row) => Boolean(row.habit_id && String(row.habit_id).trim()))
      .map((row) => {
        const habit = habitById.get(row.habit_id!);
        const checked =
          habitCheckedOverride[row.id] ?? row.status === "completed";
        const { completedCount, missedCount } = countHabitDayOutcomes(
          allHabitTasks,
          row.habit_id!,
        );
        return {
          habitId: row.habit_id!,
          taskId: row.id,
          title: habit?.title ?? row.title ?? "Habit",
          icon: habit?.icon ?? null,
          checked,
          completedCount,
          missedCount,
          sortOrder: habit?.sort_order ?? 0,
        };
      })
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.title.localeCompare(b.title, undefined, {
          sensitivity: "base",
        });
      })
      .map(({ sortOrder: _sortOrder, ...item }) => item);
    return collapseHabitItemsByHabitId(mapped);
  }, [dueTasks, habitCheckedOverride, syncedHabits, syncedTasks]);

  const rows = useMemo(
    () =>
      dueTasks.filter(
        (row) => !(row.habit_id && String(row.habit_id).trim()),
      ),
    [dueTasks],
  );

  const onToggleHabit = useCallback(
    (item: JournalHabitDayItem, checked: boolean) => {
      setHabitCheckedOverride((current) => ({
        ...current,
        [item.taskId]: checked,
      }));
      void recordHabitDay(
        client,
        item.habitId,
        {
          dueYmd: dateSlug,
          status: checked ? "completed" : "canceled",
        },
        {
          ...powerSync,
          todayTaskId: item.taskId,
        },
      ).catch(() => {
        setHabitCheckedOverride((current) => {
          const next = { ...current };
          delete next[item.taskId];
          return next;
        });
      });
    },
    [client, dateSlug, powerSync],
  );

  const onPressRow = useCallback(
    (row: GroupedTaskRow) => {
      router.push(taskDetailHref(row.id));
    },
    [router],
  );

  const snippetBody = useMemo(
    () =>
      localSnippet
        ? getJournalDisplayBody(localSnippet, dateSlug, title)
        : "",
    [dateSlug, localSnippet, title],
  );

  const displayBody = body ?? snippetBody;
  const bodyReady = Boolean(documentId) && !bodyLoading && !bodyError;

  /** Seed draft when opening a day. */
  useEffect(() => {
    if (!bodyReady) return;
    setDraftBody(displayBody);
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed keys only
  }, [dateSlug, bodyReady]);

  useEffect(() => {
    setBodyViewMode("edit");
  }, [dateSlug]);

  const saveEditing = useCallback(async () => {
    if (!documentId || saving || !bodyReady) return;
    if (draftBody === displayBody) {
      setSaveError(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const nextContent = mergeJournalContent(dateSlug, draftBody);
      if (contentVersion == null) {
        throw new Error("Journal content version is not loaded.");
      }
      const updated = await saveDocumentContent(
        client,
        documentId,
        nextContent,
        contentVersion,
      );
      setBody(getJournalDisplayBody(updated.content ?? nextContent, dateSlug, title));
      setContentVersion(updated.contentVersion);
    } catch (reason) {
      if (reason instanceof DocumentContentEmptyBodyRejectedError) {
        setSaveError(null);
        return;
      }
      setSaveError(
        formatMobileUserFacingError(reason, "Could not save journal."),
      );
    } finally {
      setSaving(false);
    }
  }, [
    bodyReady,
    client,
    contentVersion,
    dateSlug,
    displayBody,
    documentId,
    draftBody,
    saving,
    title,
  ]);

  const handleBodyViewModeChange = useCallback(
    (next: JournalBodyViewMode) => {
      if (next === bodyViewMode) return;
      if (bodyViewMode === "edit" && next === "preview") {
        void saveEditing();
      }
      setBodyViewMode(next);
    },
    [bodyViewMode, saveEditing],
  );

  const handleToggleTaskCheckbox = useCallback(
    (index: number) => {
      const next = toggleMarkdownTaskListItem(draftBody, index);
      if (next == null) return;
      setDraftBody(next);
      queueMicrotask(() => {
        void (async () => {
          if (!documentId || saving || !bodyReady) return;
          if (contentVersion == null) return;
          if (next === displayBody) return;
          setSaving(true);
          setSaveError(null);
          try {
            const nextContent = mergeJournalContent(dateSlug, next);
            const updated = await saveDocumentContent(
              client,
              documentId,
              nextContent,
              contentVersion,
            );
            setBody(
              getJournalDisplayBody(
                updated.content ?? nextContent,
                dateSlug,
                title,
              ),
            );
            setContentVersion(updated.contentVersion);
          } catch (reason) {
            if (reason instanceof DocumentContentEmptyBodyRejectedError) {
              setSaveError(null);
              return;
            }
            setSaveError(
              formatMobileUserFacingError(reason, "Could not save journal."),
            );
          } finally {
            setSaving(false);
          }
        })();
      });
    },
    [
      bodyReady,
      client,
      contentVersion,
      dateSlug,
      displayBody,
      documentId,
      draftBody,
      saving,
      title,
    ],
  );

  const listHeader = useMemo(
    () => (
      <View style={{ paddingTop: inPadJournalSplit ? 8 : 0 }}>
        {whoop.authenticated !== false ? (
          <JournalWhoopLeading dateSlug={dateSlug} state={whoop} />
        ) : null}
        <ContentPageTitle
          title={title}
          align={isPad ? "left" : "center"}
          paddingTop={whoop.authenticated !== false ? 2 : 8}
        />
        <View
          style={{ paddingHorizontal: 16, paddingBottom: 20, minHeight: 24 }}
        >
          {bodyLoading ? (
            <ActivityIndicator color={colors.muted} />
          ) : bodyError ? (
            <Text style={ui.error}>{bodyError}</Text>
          ) : bodyViewMode === "edit" ? (
            <>
              <TextInput
                value={draftBody}
                onChangeText={setDraftBody}
                placeholder="Write your journal entry…"
                placeholderTextColor={colors.muted}
                multiline
                scrollEnabled={false}
                textAlignVertical="top"
                editable={bodyReady && !saving}
                onBlur={() => {
                  void saveEditing();
                }}
                style={{
                  minHeight: 160,
                  color: colors.foreground,
                  fontSize: 15,
                  lineHeight: 22,
                }}
              />
              {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
            </>
          ) : (
            <>
              {draftBody.trim() ? (
                <JournalMarkdownBody
                  body={draftBody}
                  onToggleTaskCheckbox={handleToggleTaskCheckbox}
                />
              ) : (
                <Text style={{ color: colors.muted, fontSize: 15 }}>
                  No journal entry yet.
                </Text>
              )}
              {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
            </>
          )}
        </View>

        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 8,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <SegmentedPillToggle
            value={listMode}
            options={JOURNAL_DAY_LIST_OPTIONS}
            onChange={setListMode}
            accessibilityLabel="Journal day list"
          />
        </View>

        {listMode === "habits" ? (
          habitItems.length > 0 ? (
            <View style={{ paddingBottom: 8 }}>
              <JournalHabitsList
                items={habitItems}
                onToggle={onToggleHabit}
              />
            </View>
          ) : (
            <Text
              style={{
                paddingHorizontal: 16,
                paddingBottom: 12,
                color: colors.muted,
                fontSize: 13,
              }}
            >
              No habits due on this date.
            </Text>
          )
        ) : null}
      </View>
    ),
    [
      bodyError,
      bodyLoading,
      bodyReady,
      bodyViewMode,
      dateSlug,
      draftBody,
      habitItems,
      handleToggleTaskCheckbox,
      inPadJournalSplit,
      isPad,
      listMode,
      onToggleHabit,
      saveEditing,
      saveError,
      saving,
      title,
      whoop,
    ],
  );

  const viewModeDockInsets = inPadJournalSplit
    ? { right: 16, bottom: Math.max(safeInsets.bottom, 16) }
    : floatingComposeOverlayInsets(windowWidth, safeInsets.bottom);

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions({ embedded: isPad }),
          ...(inPadJournalSplit
            ? { headerShown: false, headerBackVisible: false }
            : null),
        }}
      />
      <View style={styles.page}>
        <GroupedTaskList
          rows={listMode === "tasks" ? rows : []}
          groupByStatus={listMode === "tasks"}
          emptyText={
            listMode === "tasks" ? "No tasks due on this date." : ""
          }
          contentConstrained={isPad}
          listHeader={listHeader}
          onPressRow={listMode === "tasks" ? onPressRow : undefined}
          onAddToStatus={
            listMode === "tasks"
              ? (status) => {
                  router.push({
                    pathname: "/create/task",
                    params: { status, dueYmd: dateSlug },
                  });
                }
              : undefined
          }
        />
        {!bodyLoading && !bodyError ? (
          <View
            pointerEvents="box-none"
            style={[styles.viewModeDock, viewModeDockInsets]}
          >
            <View style={styles.viewModeDockInner}>
              <SegmentedPillToggle
                value={bodyViewMode}
                options={JOURNAL_BODY_VIEW_OPTIONS}
                onChange={handleBodyViewModeChange}
                accessibilityLabel="Journal body view mode"
              />
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  viewModeDock: {
    position: "absolute",
    zIndex: 10,
  },
  viewModeDockInner: {
    padding: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
