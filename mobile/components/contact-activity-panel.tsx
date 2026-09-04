import { taskInvolvesContact } from "@backsteros/contracts";
import type { CrmActivity, Task } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  letterDetailHref,
  meetingDetailHref,
  taskDetailHref,
} from "../lib/detail-href";
import { parseAttendeeContactIds } from "../lib/meeting-detail-model";
import { migrateLegacyTaskStatus } from "../lib/task-status";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useCrmActivityFeed } from "../lib/use-crm-data";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { TextInput } from "./app-text-input";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";

type Props = {
  contactId: string;
};

type TimelineItem = {
  id: string;
  kind: "note" | "meeting" | "task" | "letter";
  occurredAt: string;
  title: string;
  body?: string;
  taskId?: string;
  letterId?: string;
  meetingId?: string;
};

type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  habit_id: string | null;
  contact_id: string | null;
  assignee_id: string | null;
  related_contact_ids: string | null;
  updated_at: string | null;
  completed_at: string | null;
};

type LetterRow = {
  id: string;
  title: string | null;
  received_date: string | null;
  created_at: string | null;
  due_date: string | null;
};

type LocalCrmRow = {
  id: string;
  kind: string | null;
  body: string | null;
  body_preview: string | null;
  meeting_id: string | null;
  occurred_at: string | null;
};

/** Local completed-task rows (assignee / linked). Related-only links come via REST. */
const TASKS_SQL_NO_RELATED = `SELECT
  id, title, status, habit_id, contact_id, assignee_id,
  NULL AS related_contact_ids,
  updated_at, completed_at
 FROM tasks
 WHERE deleted_at IS NULL
   AND habit_id IS NULL
   AND (contact_id = ? OR assignee_id = ?)
 ORDER BY updated_at DESC
 LIMIT 200`;

const LETTERS_SQL = `SELECT id, title, received_date, created_at, due_date
 FROM letters
 WHERE deleted_at IS NULL AND contact_id = ?
 ORDER BY COALESCE(received_date, created_at, due_date) DESC
 LIMIT 100`;

const LOCAL_CRM_SQL = `SELECT id, kind, body, body_preview, meeting_id, occurred_at
 FROM crm_activities
 WHERE deleted_at IS NULL
   AND subject_type = 'contact'
   AND subject_id = ?
 ORDER BY occurred_at DESC
 LIMIT 100`;

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const deltaSec = Math.round((Date.now() - then) / 1000);
  if (deltaSec < 45) return "just now";
  if (deltaSec < 3600) return `${Math.max(1, Math.round(deltaSec / 60))}m ago`;
  if (deltaSec < 86_400) return `${Math.round(deltaSec / 3600)}h ago`;
  if (deltaSec < 86_400 * 2) return "Yesterday";
  if (deltaSec < 86_400 * 7) return `${Math.round(deltaSec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(iso).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });
}

function kindLabel(kind: TimelineItem["kind"]): string {
  switch (kind) {
    case "meeting":
      return "Meeting";
    case "task":
      return "Task";
    case "letter":
      return "Letter";
    default:
      return "Note";
  }
}

function mapCrmItem(item: CrmActivity): TimelineItem {
  if (item.kind === "meeting") {
    return {
      id: item.id,
      kind: "meeting",
      occurredAt: item.occurredAt,
      title: item.meetingTitle?.trim() || "Meeting",
      body: item.bodyPreview?.trim() || item.body?.trim() || undefined,
      meetingId: item.meetingId ?? undefined,
    };
  }
  return {
    id: item.id,
    kind: "note",
    occurredAt: item.occurredAt,
    title: "Note",
    body: item.body?.trim() || item.bodyPreview?.trim() || undefined,
  };
}

function mapLocalCrmRow(row: LocalCrmRow): TimelineItem | null {
  if (!row.occurred_at || !row.id) return null;
  if (row.kind === "meeting") {
    return {
      id: row.id,
      kind: "meeting",
      occurredAt: row.occurred_at,
      title: "Meeting",
      body: row.body_preview?.trim() || row.body?.trim() || undefined,
      meetingId: row.meeting_id ?? undefined,
    };
  }
  return {
    id: row.id,
    kind: "note",
    occurredAt: row.occurred_at,
    title: "Note",
    body: row.body?.trim() || row.body_preview?.trim() || undefined,
  };
}

function completedTaskItems(
  rows: readonly TaskRow[],
  contactId: string,
): TimelineItem[] {
  return rows
    .filter((row) => {
      if (row.habit_id?.trim()) return false;
      if (migrateLegacyTaskStatus(row.status) !== "completed") return false;
      return taskInvolvesContact(
        {
          contactId: row.contact_id,
          assigneeId: row.assignee_id,
          relatedContactIds: parseAttendeeContactIds(row.related_contact_ids),
        },
        contactId,
      );
    })
    .map((row) => ({
      id: `task:${row.id}`,
      kind: "task" as const,
      occurredAt: row.completed_at || row.updated_at || new Date(0).toISOString(),
      title: row.title?.trim() || "Untitled task",
      taskId: row.id,
    }));
}

/**
 * Contact Activity tab — CRM notes/meetings + completed tasks + letters
 * (desktop contacts-page timeline parity).
 */
export function ContactActivityPanel({ contactId }: Props) {
  const router = useRouter();
  const client = useMobileApiClient();
  const {
    items: feedItems,
    nextCursor,
    loading: feedLoading,
    error: feedError,
    loadMore,
    submitNote,
  } = useCrmActivityFeed("contact", contactId, Boolean(contactId));

  const { data: taskRows, isLoading: tasksLoading } = useLocalQuery<TaskRow>(
    TASKS_SQL_NO_RELATED,
    [contactId, contactId],
  );
  const { data: letterRows, isLoading: lettersLoading } =
    useLocalQuery<LetterRow>(LETTERS_SQL, [contactId]);
  const { data: localCrmRows, isLoading: localCrmLoading } =
    useLocalQuery<LocalCrmRow>(LOCAL_CRM_SQL, [contactId]);

  const [restTaskRows, setRestTaskRows] = useState<TaskRow[] | null>(null);
  const [restTasksLoading, setRestTasksLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset REST rescue when switching contacts.
  useEffect(() => {
    setRestTaskRows(null);
    setRestTasksLoading(false);
  }, [contactId]);

  // REST rescue when SQLite has no completed-task rows for this contact.
  useEffect(() => {
    if (!contactId) return;
    if (tasksLoading) return;
    if (restTaskRows != null) return;
    const localCompleted = completedTaskItems(taskRows ?? [], contactId);
    if (localCompleted.length > 0) return;

    let cancelled = false;
    setRestTasksLoading(true);
    void (async () => {
      try {
        const [byContact, byAssignee, byRelated] = await Promise.all([
          client.requestJson<{ tasks: Task[] }>(
            `/api/v1/tasks?contactId=${encodeURIComponent(contactId)}`,
          ),
          client.requestJson<{ tasks: Task[] }>(
            `/api/v1/tasks?assigneeId=${encodeURIComponent(contactId)}`,
          ),
          client.requestJson<{ tasks: Task[] }>(
            `/api/v1/tasks?relatedContactId=${encodeURIComponent(contactId)}`,
          ),
        ]);
        if (cancelled) return;
        const byId = new Map<string, Task>();
        for (const task of [
          ...(byContact.tasks ?? []),
          ...(byAssignee.tasks ?? []),
          ...(byRelated.tasks ?? []),
        ]) {
          byId.set(task.id, task);
        }
        const rows: TaskRow[] = [...byId.values()].map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status ?? null,
          habit_id: task.habitId ?? null,
          contact_id: task.contactId ?? null,
          assignee_id: task.assigneeId ?? null,
          related_contact_ids: JSON.stringify(task.relatedContactIds ?? []),
          updated_at:
            typeof task.updatedAt === "string"
              ? task.updatedAt
              : task.updatedAt
                ? new Date(task.updatedAt).toISOString()
                : null,
          completed_at: task.completedAt ?? null,
        }));
        setRestTaskRows(rows);
        console.info(
          `[mobile] contact activity tasks via REST (${rows.length})`,
        );
      } catch (reason) {
        console.warn(
          "[mobile] contact activity tasks REST failed",
          reason instanceof Error ? reason.message : reason,
        );
        if (!cancelled) setRestTaskRows([]);
      } finally {
        if (!cancelled) setRestTasksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, contactId, restTaskRows, taskRows, tasksLoading]);

  const timeline = useMemo(() => {
    const fromLocalCrm = (localCrmRows ?? [])
      .map(mapLocalCrmRow)
      .filter((entry): entry is TimelineItem => entry != null);
    const fromFeed = feedItems.map(mapCrmItem);
    const crmById = new Map<string, TimelineItem>();
    for (const item of [...fromLocalCrm, ...fromFeed]) {
      crmById.set(item.id, item);
    }

    const taskSource =
      (taskRows?.length ?? 0) > 0 ? taskRows! : (restTaskRows ?? []);
    const completedTasks = completedTaskItems(taskSource, contactId);

    const letterItems = (letterRows ?? [])
      .map((row): TimelineItem | null => {
        const occurredAt =
          row.received_date || row.created_at || row.due_date || null;
        if (!occurredAt) return null;
        return {
          id: `letter:${row.id}`,
          kind: "letter",
          occurredAt,
          title: row.title?.trim() || "Untitled letter",
          letterId: row.id,
        };
      })
      .filter((entry): entry is TimelineItem => entry != null);

    return [...crmById.values(), ...completedTasks, ...letterItems].sort(
      (left, right) => right.occurredAt.localeCompare(left.occurredAt),
    );
  }, [contactId, feedItems, letterRows, localCrmRows, restTaskRows, taskRows]);

  const loading =
    timeline.length === 0 &&
    (feedLoading ||
      tasksLoading ||
      lettersLoading ||
      localCrmLoading ||
      restTasksLoading);

  const onSubmit = useCallback(async () => {
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitNote(body);
      setDraft("");
    } catch (reason) {
      setSubmitError(
        reason instanceof Error ? reason.message : "Could not save note.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitNote, submitting]);

  const onOpenItem = useCallback(
    (item: TimelineItem) => {
      if (item.kind === "task" && item.taskId) {
        router.push(taskDetailHref(item.taskId));
        return;
      }
      if (item.kind === "letter" && item.letterId) {
        router.push(letterDetailHref(item.letterId));
        return;
      }
      if (item.kind === "meeting" && item.meetingId) {
        router.push(meetingDetailHref(item.meetingId));
      }
    },
    [router],
  );

  return (
    <KeyboardAwareScrollView
      style={ui.screen}
      contentContainerStyle={styles.content}
      keepEndVisibleWhileTyping
    >
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a note…"
          placeholderTextColor={colors.muted}
          multiline
          style={styles.composerInput}
        />
        <Pressable
          onPress={() => void onSubmit()}
          disabled={!draft.trim() || submitting}
          style={({ pressed }) => [
            styles.submitButton,
            (!draft.trim() || submitting) && styles.submitDisabled,
            pressed && draft.trim() ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save note"
        >
          <Text style={styles.submitLabel}>
            {submitting ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>
      {submitError ? <Text style={ui.error}>{submitError}</Text> : null}
      {feedError ? <Text style={ui.error}>{feedError}</Text> : null}
      {loading ? (
        <ActivityIndicator color={colors.muted} style={{ marginTop: 24 }} />
      ) : null}
      {!loading && timeline.length === 0 ? (
        <Text style={ui.hint}>
          No activity yet. Add a note, or complete a related task.
        </Text>
      ) : null}
      {timeline.map((item) => {
        const openable =
          (item.kind === "task" && item.taskId) ||
          (item.kind === "letter" && item.letterId) ||
          (item.kind === "meeting" && item.meetingId);
        const Card = openable ? Pressable : View;
        return (
          <Card
            key={item.id}
            style={styles.card}
            {...(openable
              ? {
                  onPress: () => onOpenItem(item),
                  accessibilityRole: "button" as const,
                }
              : {})}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.kind}>{kindLabel(item.kind)}</Text>
              <Text style={styles.when}>
                {formatRelativeTime(item.occurredAt)}
              </Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
          </Card>
        );
      })}
      {nextCursor ? (
        <Pressable
          onPress={() => void loadMore()}
          style={styles.loadMore}
          accessibilityRole="button"
        >
          <Text style={styles.loadMoreLabel}>Load more notes</Text>
        </Pressable>
      ) : null}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  composer: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 10,
  },
  composerInput: {
    color: colors.foreground,
    fontSize: 16,
    minHeight: 72,
    textAlignVertical: "top",
  },
  submitButton: {
    alignSelf: "flex-end",
    backgroundColor: colors.foreground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitLabel: {
    color: colors.background,
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  kind: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  when: {
    color: colors.muted,
    fontSize: 12,
  },
  title: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  body: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 21,
  },
  loadMore: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  loadMoreLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
});
