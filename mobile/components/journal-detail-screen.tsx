import type { Document, DocumentContent } from "@backsteros/contracts";
import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Text,
  View,
} from "react-native";

import { useCalendarTimeZone } from "../lib/calendar-timezone";
import { isPadDevice } from "../lib/device";
import { taskDetailHref } from "../lib/detail-href";
import { recordHabitDay } from "../lib/habits/api";
import { formatJournalEntryTitle } from "../lib/journal";
import {
  getJournalDisplayBody,
  mergeJournalContent,
} from "../lib/journal-content";
import { withDisplayId } from "../lib/map-task-row";
import { useMobilePowerSync } from "../lib/powersync-context";
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
import { SegmentedPillToggle } from "./segmented-pill-toggle";
import { TextInput } from "./app-text-input";

type JournalDayListMode = "tasks" | "habits";

const JOURNAL_DAY_LIST_OPTIONS = [
  { value: "tasks" as const, label: "Tasks" },
  { value: "habits" as const, label: "Habits" },
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
};

type Props = {
  dateSlug: string;
};

/** Title → markdown body → due-tasks list (desktop journal layout). */
const JOURNAL_DOC_SQL = `SELECT id, journal_date, snippet FROM documents
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

  const client = useMobileApiClient();
  const whoop = useWhoopDaySnapshot(dateSlug);

  const { data: syncedDocs, isLoading: docSyncLoading } =
    useLocalQuery<JournalDocRow>(JOURNAL_DOC_SQL, [dateSlug]);
  const localDocId = syncedDocs?.[0]?.id ?? null;
  const localSnippet = syncedDocs?.[0]?.snippet ?? null;

  const [restDocId, setRestDocId] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [bodyLoading, setBodyLoading] = useState(true);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
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
    void client
      .requestJson<Document>(
        `/api/v1/journal/${encodeURIComponent(dateSlug)}`,
      )
      .then((document) => {
        if (!cancelled) setRestDocId(document.id);
      })
      .catch((reason) => {
        if (cancelled) return;
        setRestDocId(null);
        setBodyLoading(false);
        setBodyError(
          reason instanceof Error
            ? reason.message
            : "Could not open journal entry.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [client, dateSlug, docSyncLoading, localDocId, powerSync.ready]);

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
    void client
      .requestJson<DocumentContent>(
        `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
      )
      .then((result) => {
        if (cancelled) return;
        setBody(getJournalDisplayBody(result.content ?? "", dateSlug, title));
      })
      .catch((reason) => {
        if (cancelled) return;
        setBody(null);
        setBodyError(
          reason instanceof Error ? reason.message : String(reason),
        );
      })
      .finally(() => {
        if (!cancelled) setBodyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, dateSlug, documentId, title]);

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
      void recordHabitDay(client, item.habitId, {
        dueYmd: dateSlug,
        status: checked ? "completed" : "canceled",
      }).catch(() => {
        setHabitCheckedOverride((current) => {
          const next = { ...current };
          delete next[item.taskId];
          return next;
        });
      });
    },
    [client, dateSlug],
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

  /** Body stays inline-editable — no Edit button. Seed once per open. */
  useEffect(() => {
    if (!bodyReady) return;
    setDraftBody(displayBody);
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed keys only
  }, [dateSlug, bodyReady]);

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
      await client.requestJson<DocumentContent>(
        `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: nextContent }),
        },
      );
      setBody(getJournalDisplayBody(nextContent, dateSlug, title));
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : "Could not save journal.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    bodyReady,
    client,
    dateSlug,
    displayBody,
    documentId,
    draftBody,
    saving,
    title,
  ]);

  const listHeader = useMemo(
    () => (
      <View style={{ paddingTop: inPadJournalSplit ? 12 : 4 }}>
        <JournalWhoopLeading dateSlug={dateSlug} state={whoop} />
        <ContentPageTitle title={title} />
        <View
          style={{ paddingHorizontal: 16, paddingBottom: 20, minHeight: 24 }}
        >
          {bodyLoading ? (
            <ActivityIndicator color={colors.muted} />
          ) : bodyError ? (
            <Text style={ui.error}>{bodyError}</Text>
          ) : (
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
      dateSlug,
      draftBody,
      habitItems,
      inPadJournalSplit,
      listMode,
      onToggleHabit,
      saveEditing,
      saveError,
      saving,
      title,
      whoop,
    ],
  );

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
    </>
  );
}
