import { taskInvolvesContact } from "@backsteros/contracts";
import type { CrmActivity, Task } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";

import {
  letterDetailHref,
  meetingDetailHref,
  taskDetailHref,
} from "../lib/detail-href";
import { parseAttendeeContactIds } from "../lib/meeting-detail-model";
import { migrateLegacyTaskStatus } from "../lib/task-status";
import { ui } from "../lib/ui";
import { useCrmActivityFeed } from "../lib/use-crm-data";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import {
  CrmActivityFeed,
  type CrmActivityFeedItem,
} from "./crm-activity-feed";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";

type Props = {
  contactId: string;
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
  meeting_title: string | null;
  occurred_at: string | null;
};

/** Local completed-task rows (assignee / linked / Related). */
const TASKS_SQL = `SELECT
  id, title, status, habit_id, contact_id, assignee_id,
  related_contact_ids,
  updated_at, completed_at
 FROM tasks
 WHERE deleted_at IS NULL
   AND habit_id IS NULL
   AND (
     contact_id = ?
     OR assignee_id = ?
     OR (
       related_contact_ids IS NOT NULL
       AND related_contact_ids LIKE '%"' || ? || '"%'
     )
   )
 ORDER BY updated_at DESC
 LIMIT 200`;

const LETTERS_SQL = `SELECT id, title, received_date, created_at, due_date
 FROM letters
 WHERE deleted_at IS NULL AND contact_id = ?
 ORDER BY COALESCE(received_date, created_at, due_date) DESC
 LIMIT 100`;

const LOCAL_CRM_SQL = `SELECT
  a.id,
  a.kind,
  a.body,
  a.body_preview,
  a.meeting_id,
  m.title AS meeting_title,
  a.occurred_at
 FROM crm_activities a
 LEFT JOIN meetings m ON m.id = a.meeting_id AND m.deleted_at IS NULL
 WHERE a.deleted_at IS NULL
   AND a.subject_type = 'contact'
   AND a.subject_id = ?
 ORDER BY a.occurred_at DESC
 LIMIT 100`;

function mapCrmItem(item: CrmActivity): CrmActivityFeedItem {
  if (item.kind === "meeting") {
    return {
      id: item.id,
      kind: "meeting",
      occurredAt: item.occurredAt,
      body: item.body,
      bodyPreview: item.bodyPreview,
      meetingId: item.meetingId,
      meetingTitle: item.meetingTitle,
    };
  }
  return {
    id: item.id,
    kind: "note",
    occurredAt: item.occurredAt,
    body: item.body,
    bodyPreview: item.bodyPreview,
  };
}

function mapLocalCrmRow(row: LocalCrmRow): CrmActivityFeedItem | null {
  if (!row.occurred_at || !row.id) return null;
  if (row.kind === "meeting") {
    return {
      id: row.id,
      kind: "meeting",
      occurredAt: row.occurred_at,
      body: row.body,
      bodyPreview: row.body_preview,
      meetingId: row.meeting_id,
      meetingTitle: row.meeting_title,
    };
  }
  return {
    id: row.id,
    kind: "note",
    occurredAt: row.occurred_at,
    body: row.body,
    bodyPreview: row.body_preview,
  };
}

function completedTaskItems(
  rows: readonly TaskRow[],
  contactId: string,
): CrmActivityFeedItem[] {
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
      occurredAt:
        row.completed_at || row.updated_at || new Date(0).toISOString(),
      taskId: row.id,
      taskTitle: row.title,
      taskRelation:
        row.assignee_id === contactId
          ? ("assigned" as const)
          : ("related" as const),
    }));
}

/**
 * Contact Activity tab — CRM notes/meetings + completed tasks + letters
 * (desktop `CrmActivityFeedView` chrome).
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
    TASKS_SQL,
    [contactId, contactId, contactId],
  );
  const { data: letterRows, isLoading: lettersLoading } =
    useLocalQuery<LetterRow>(LETTERS_SQL, [contactId]);
  const { data: localCrmRows, isLoading: localCrmLoading } =
    useLocalQuery<LocalCrmRow>(LOCAL_CRM_SQL, [contactId]);

  const [restTaskRows, setRestTaskRows] = useState<TaskRow[] | null>(null);
  const [restTasksLoading, setRestTasksLoading] = useState(false);

  useEffect(() => {
    setRestTaskRows(null);
    setRestTasksLoading(false);
  }, [contactId]);

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
      } catch {
        if (!cancelled) setRestTaskRows([]);
      } finally {
        if (!cancelled) setRestTasksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, contactId, restTaskRows, taskRows, tasksLoading]);

  const items = useMemo(() => {
    const fromLocalCrm = (localCrmRows ?? [])
      .map(mapLocalCrmRow)
      .filter((entry): entry is CrmActivityFeedItem => entry != null);
    const fromFeed = feedItems.map(mapCrmItem);
    const crmById = new Map<string, CrmActivityFeedItem>();
    for (const item of [...fromLocalCrm, ...fromFeed]) {
      crmById.set(item.id, item);
    }

    const taskSource =
      (taskRows?.length ?? 0) > 0 ? taskRows! : (restTaskRows ?? []);
    const completedTasks = completedTaskItems(taskSource, contactId);

    const letterItems = (letterRows ?? [])
      .map((row): CrmActivityFeedItem | null => {
        const occurredAt =
          row.received_date || row.created_at || row.due_date || null;
        if (!occurredAt) return null;
        return {
          id: `letter:${row.id}`,
          kind: "letter",
          occurredAt,
          letterId: row.id,
          letterTitle: row.title,
        };
      })
      .filter((entry): entry is CrmActivityFeedItem => entry != null);

    return [...crmById.values(), ...completedTasks, ...letterItems].sort(
      (left, right) => right.occurredAt.localeCompare(left.occurredAt),
    );
  }, [contactId, feedItems, letterRows, localCrmRows, restTaskRows, taskRows]);

  const loading =
    items.length === 0 &&
    (feedLoading ||
      tasksLoading ||
      lettersLoading ||
      localCrmLoading ||
      restTasksLoading);

  return (
    <KeyboardAwareScrollView
      style={ui.screen}
      contentContainerStyle={styles.content}
      keepEndVisibleWhileTyping
    >
      <CrmActivityFeed
        items={items}
        loading={loading}
        error={feedError}
        nextCursor={nextCursor}
        onLoadMore={loadMore}
        onSubmitNote={submitNote}
        onCreateTask={() => {
          router.push({
            pathname: "/create/task",
            params: { contactId },
          });
        }}
        onCreateEmail={() => {
          router.push("/email/compose");
        }}
        onCreateMeeting={() => {
          router.push("/create/meeting");
        }}
        onCreateLetter={() => {
          router.push({
            pathname: "/create/letter",
            params: { contactId },
          });
        }}
        onOpenMeeting={(meetingId) => {
          router.push(meetingDetailHref(meetingId));
        }}
        onOpenTask={(taskId) => {
          router.push(taskDetailHref(taskId));
        }}
        onOpenLetter={(letterId) => {
          router.push(letterDetailHref(letterId));
        }}
      />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 4,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
});
