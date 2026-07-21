import type { Document, DocumentContent, Project, Task } from "@backsteros/contracts";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useCalendarTimeZone } from "../lib/calendar-timezone";
import { taskDetailHref } from "../lib/detail-href";
import { getMobileEnvironment } from "../lib/env";
import { formatJournalEntryTitle } from "../lib/journal";
import {
  getJournalDisplayBody,
  mergeJournalContent,
} from "../lib/journal-content";
import { mapApiTaskToRow, withDisplayId } from "../lib/map-task-row";
import { useMobilePowerSync } from "../lib/powersync-context";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import {
  filterTasksDueOnJournalDate,
  getTaskDueDateYmd,
} from "../lib/task-due-date";
import { TASK_LIST_SELECT } from "../lib/task-list-query";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { GroupedTaskList, type GroupedTaskRow } from "./grouped-task-list";
import { JournalMarkdownBody } from "./journal-markdown-body";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { TasksNavIcon } from "./nav-icons";

type SyncedTaskRow = GroupedTaskRow & {
  number?: number | null;
  project_id?: string | null;
  contact_id?: string | null;
  project_key?: string | null;
};

type JournalDocRow = {
  id: string;
  journal_date: string;
  snippet: string | null;
};

type Props = {
  dateSlug: string;
};

function HeaderAction({
  label,
  onPress,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minWidth: 52,
        minHeight: 36,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled || loading ? 0.35 : pressed ? 0.55 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={colors.foreground} size="small" />
      ) : (
        <Text
          style={{
            color: colors.foreground,
            fontSize: 17,
            fontWeight: "600",
            lineHeight: 22,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Title → markdown body → due-tasks list (desktop journal layout). */
const JOURNAL_DOC_SQL = `SELECT id, journal_date, snippet FROM documents
 WHERE deleted_at IS NULL
   AND type = 'journal'
   AND journal_date = ?
 LIMIT 1`;

export function JournalDetailScreen({ dateSlug }: Props) {
  const router = useRouter();
  const title = formatJournalEntryTitle(dateSlug);
  const calendarTimeZone = useCalendarTimeZone();
  const { apiUrl } = getMobileEnvironment();
  const powerSync = useMobilePowerSync();

  const client = useMobileApiClient();

  const { data: syncedDocs, isLoading: docSyncLoading } =
    useLocalQuery<JournalDocRow>(JOURNAL_DOC_SQL, [dateSlug]);
  const localDocId = syncedDocs?.[0]?.id ?? null;
  const localSnippet = syncedDocs?.[0]?.snippet ?? null;

  const [restDocId, setRestDocId] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [bodyLoading, setBodyLoading] = useState(true);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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

  const { data: syncedTasks, isLoading: syncLoading } =
    useLocalQuery<SyncedTaskRow>(tasksSql);

  const [restRows, setRestRows] = useState<GroupedTaskRow[]>([]);
  const [restError, setRestError] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);

  const useRest = !powerSync.ready;

  const reloadRest = useCallback(async () => {
    if (powerSync.ready) return;
    setRestLoading(true);
    setRestError(null);
    try {
      const [tasksBody, projectsBody, settingsBody] = await Promise.all([
        client.requestJson<{ tasks: Task[] }>("/api/v1/tasks"),
        client.requestJson<{ projects: Project[] }>("/api/v1/projects"),
        client
          .requestJson<{ settings: { timezone?: string } }>("/api/v1/settings")
          .catch(() => null),
      ]);
      const timeZone =
        settingsBody?.settings?.timezone?.trim() || calendarTimeZone;
      const projectsById = new Map(
        (projectsBody.projects ?? []).map((project) => [project.id, project]),
      );
      setRestRows(
        (tasksBody.tasks ?? [])
          .filter(
            (task) => getTaskDueDateYmd(task.dueDate, timeZone) === dateSlug,
          )
          .map((task) => mapApiTaskToRow(task, projectsById)),
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
  }, [apiUrl, calendarTimeZone, client, dateSlug, powerSync.ready]);

  useEffect(() => {
    if (useRest) void reloadRest();
  }, [reloadRest, useRest]);

  const localRows = useMemo(
    () =>
      filterTasksDueOnJournalDate(
        (syncedTasks ?? []).map((row) => withDisplayId(row)),
        dateSlug,
        calendarTimeZone,
      ),
    [calendarTimeZone, dateSlug, syncedTasks],
  );
  const rows = useMemo(() => {
    if (localRows.length > 0) return localRows;
    if (!powerSync.ready || syncLoading) return restRows;
    return localRows;
  }, [localRows, powerSync.ready, restRows, syncLoading]);

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

  const canEdit = Boolean(documentId) && !bodyLoading && !bodyError;

  function startEditing() {
    setDraftBody(body ?? snippetBody);
    setSaveError(null);
    setEditing(true);
  }


  async function saveEditing() {
    if (!documentId || saving) return;
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
      setEditing(false);
      setDraftBody("");
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : "Could not save journal.",
      );
    } finally {
      setSaving(false);
    }
  }

  const listHeader = useMemo(
    () => (
      <View>
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 12,
          }}
        >
          <Text style={ui.detailTitle}>{title}</Text>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 20, minHeight: 24 }}>
          {bodyLoading ? (
            <ActivityIndicator color={colors.muted} />
          ) : bodyError ? (
            <Text style={ui.error}>{bodyError}</Text>
          ) : body != null ? (
            body.trim() ? (
              <JournalMarkdownBody body={body} />
            ) : (
              <Text style={ui.rowMeta}>No content yet.</Text>
            )
          ) : snippetBody.trim() ? (
            <Text style={ui.rowMeta}>{snippetBody}</Text>
          ) : (
            <Text style={ui.rowMeta}>No content yet.</Text>
          )}
        </View>

        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <TasksNavIcon color={colors.muted} size={16} />
          <Text
            style={{
              color: colors.muted,
              fontSize: 13,
              fontWeight: "600",
              letterSpacing: 0.2,
            }}
          >
            Tasks
          </Text>
        </View>
      </View>
    ),
    [body, bodyError, bodyLoading, snippetBody, title],
  );

  if (editing) {
    return (
      <>
        <Stack.Screen
          options={{
            ...tabDetailScreenOptions(),
            headerRight: () => (
              <HeaderAction
                label="Save"
                onPress={() => {
                  void saveEditing();
                }}
                loading={saving}
                disabled={saving}
              />
            ),
          }}
        />
        <KeyboardAwareScrollView
          style={ui.screen}
          keepEndVisibleWhileTyping
        >
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: 12,
            }}
          >
            <Text style={ui.detailTitle}>{title}</Text>
          </View>
          <TextInput
            value={draftBody}
            onChangeText={setDraftBody}
            placeholder="Write your journal entry…"
            placeholderTextColor={colors.muted}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            autoFocus
            style={{
              paddingHorizontal: 16,
              minHeight: 280,
              color: colors.foreground,
              fontSize: 15,
              lineHeight: 22,
            }}
          />
          {saveError ? <Text style={ui.error}>{saveError}</Text> : null}
        </KeyboardAwareScrollView>
      </>
    );
  }

  // Always render the page shell — never block title/tasks behind content fetch.
  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          headerRight: () => (
            <HeaderAction
              label="Edit"
              onPress={startEditing}
              disabled={!canEdit}
            />
          ),
        }}
      />
      <GroupedTaskList
        rows={rows}
        emptyText={
          restError && rows.length === 0
            ? restError
            : "No tasks due on this date."
        }
        listHeader={listHeader}
        refreshing={useRest ? restLoading : false}
        onRefresh={() => {
          if (useRest) void reloadRest();
          else void powerSync.retry();
        }}
        onPressRow={onPressRow}
      />
    </>
  );
}
