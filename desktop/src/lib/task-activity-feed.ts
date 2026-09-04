import { useEffect, useMemo } from "react";
import type { TaskActivity, TaskActivityType, TaskComment } from "@backsteros/contracts";

import { useDesktopPowerSync, usePowerSyncQuery } from "./powersync-context";
import type { PowerSyncRowComparator } from "./powersync-row-comparators";

const TASK_ACTIVITIES_SQL = `
SELECT
  id,
  task_id,
  type,
  actor_user_id,
  actor_contact_id,
  actor_email,
  actor_name,
  data,
  created_at
FROM task_activities
WHERE task_id = ?
`;

const TASK_COMMENTS_SQL = `
SELECT
  tc.id,
  tc.task_id,
  tc.parent_comment_id,
  tc.author_user_id,
  tc.author_contact_id,
  tc.author_email,
  tc.body,
  tc.resolved_at,
  tc.created_at,
  tc.updated_at,
  tc.deleted_at,
  ct.name AS contact_name
FROM task_comments tc
LEFT JOIN contacts ct ON ct.id = tc.author_contact_id AND ct.deleted_at IS NULL
WHERE tc.task_id = ? AND tc.deleted_at IS NULL
`;

const ACTIVITY_TYPES = new Set<TaskActivityType>([
  "created",
  "status_changed",
  "assignee_changed",
  "related_contacts_changed",
  "related_organizations_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
  "agent_worked",
  "timer_started",
  "timer_stopped",
]);

type ActivityRow = {
  id: string;
  task_id: string;
  type: string;
  actor_user_id: string | null;
  actor_contact_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  data: string | Record<string, unknown> | null;
  created_at: string;
};

type CommentRow = {
  id: string;
  task_id: string;
  parent_comment_id: string | null;
  author_user_id: string | null;
  author_contact_id: string | null;
  author_email: string | null;
  body: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  contact_name?: string | null;
};

const ACTIVITY_ROW_COMPARATOR: PowerSyncRowComparator<ActivityRow> = {
  keyBy: (row) => String(row.id ?? ""),
  compareBy: (row) =>
    `${row.type ?? ""}\0${row.created_at ?? ""}\0${
      typeof row.data === "string" ? row.data : JSON.stringify(row.data ?? {})
    }`,
};

const COMMENT_ROW_COMPARATOR: PowerSyncRowComparator<CommentRow> = {
  keyBy: (row) => String(row.id ?? ""),
  compareBy: (row) =>
    `${row.updated_at ?? ""}\0${row.resolved_at ?? ""}\0${row.body ?? ""}\0${
      row.deleted_at ?? ""
    }`,
};

function parseActivityData(
  value: string | Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function asActivityType(value: string): TaskActivityType | null {
  return ACTIVITY_TYPES.has(value as TaskActivityType)
    ? (value as TaskActivityType)
    : null;
}

export function sqliteRowToTaskActivity(row: ActivityRow): TaskActivity | null {
  const type = asActivityType(row.type);
  if (!type || !row.id || !row.task_id || !row.created_at) return null;
  const actorName =
    row.actor_name?.trim() ||
    row.actor_email?.trim().split("@")[0]?.trim() ||
    (row.actor_user_id || row.actor_contact_id ? "User" : "Agent");
  return {
    id: row.id,
    taskId: row.task_id,
    type,
    actorUserId: row.actor_user_id,
    actorContactId: row.actor_contact_id,
    actorEmail: row.actor_email,
    actorName,
    data: parseActivityData(row.data),
    createdAt: row.created_at,
  };
}

export function sqliteRowToTaskComment(row: CommentRow): TaskComment {
  const authorContactId = row.author_contact_id;
  const isGenericAgent = !row.author_user_id && !authorContactId;
  let authorName = "Agent";
  if (!isGenericAgent) {
    if (row.contact_name?.trim()) {
      authorName = row.contact_name.trim();
    } else if (row.author_email?.trim()) {
      const local = row.author_email.trim().split("@")[0]?.trim();
      authorName = local || row.author_email.trim();
    } else {
      authorName = "User";
    }
  }

  return {
    id: row.id,
    taskId: row.task_id,
    parentCommentId: row.parent_comment_id,
    authorUserId: row.author_user_id,
    authorContactId,
    authorEmail: row.author_email,
    authorName,
    body: row.body,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Session cache so task switches paint instantly before the watch resolves. */
const feedSessionCache = new Map<
  string,
  { activities: TaskActivity[]; comments: TaskComment[] }
>();

export function readTaskActivityFeedCache(taskId: string): {
  activities: TaskActivity[];
  comments: TaskComment[];
} | null {
  return feedSessionCache.get(taskId) ?? null;
}

export function writeTaskActivityFeedCache(
  taskId: string,
  activities: TaskActivity[],
  comments: TaskComment[],
): void {
  feedSessionCache.set(taskId, { activities, comments });
}

/**
 * Local-first task activity + comments from PowerSync SQLite.
 * Falls back to null rows when PowerSync is not ready (caller uses REST).
 */
export function useTaskActivityLocalFeed(taskId: string | null | undefined) {
  const { ready } = useDesktopPowerSync();
  const enabled = Boolean(ready && taskId);
  const activityQuery = usePowerSyncQuery<ActivityRow>(
    enabled ? TASK_ACTIVITIES_SQL : null,
    taskId ? [taskId] : [],
    { rowComparator: ACTIVITY_ROW_COMPARATOR },
  );
  const commentQuery = usePowerSyncQuery<CommentRow>(
    enabled ? TASK_COMMENTS_SQL : null,
    taskId ? [taskId] : [],
    { rowComparator: COMMENT_ROW_COMPARATOR },
  );

  const activities = useMemo(() => {
    if (!activityQuery.data) return null;
    return activityQuery.data
      .map(sqliteRowToTaskActivity)
      .filter((row): row is TaskActivity => row != null);
  }, [activityQuery.data]);

  const comments = useMemo(() => {
    if (!commentQuery.data) return null;
    return commentQuery.data.map(sqliteRowToTaskComment);
  }, [commentQuery.data]);

  const cached = taskId ? readTaskActivityFeedCache(taskId) : null;
  const snapshotReady = activities != null && comments != null;

  useEffect(() => {
    if (!enabled || !taskId || !snapshotReady || !activities || !comments) {
      return;
    }
    writeTaskActivityFeedCache(taskId, activities, comments);
  }, [activities, comments, enabled, snapshotReady, taskId]);

  return {
    active: enabled && !activityQuery.error && !commentQuery.error,
    activities: snapshotReady
      ? activities
      : (cached?.activities ?? null),
    comments: snapshotReady
      ? comments
      : (cached?.comments ?? null),
    loading:
      enabled &&
      !activityQuery.error &&
      !commentQuery.error &&
      !snapshotReady &&
      cached == null,
    error: activityQuery.error ?? commentQuery.error,
  };
}
