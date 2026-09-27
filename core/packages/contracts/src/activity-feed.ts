import type { TaskActivity, TaskComment } from "./schemas.js";

/** System event types in the unified stream (excludes discussion comments). */
export const TASK_SYSTEM_ACTIVITY_TYPES = [
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
] as const;

export type TaskSystemActivityType = (typeof TASK_SYSTEM_ACTIVITY_TYPES)[number];

/** Map a unified `type=comment` activity row into the TaskComment shape. */
export function taskActivityToTaskComment(
  activity: TaskActivity,
): TaskComment | null {
  if (activity.type !== "comment") return null;
  if (activity.deletedAt) return null;
  const body = typeof activity.body === "string" ? activity.body : "";
  if (!body.trim()) return null;
  return {
    id: activity.id,
    taskId: activity.taskId,
    parentCommentId: activity.parentId ?? null,
    authorUserId: activity.actorUserId,
    authorContactId: activity.actorContactId,
    authorEmail: activity.actorEmail,
    authorName: activity.actorName,
    body,
    resolvedAt: activity.resolvedAt ?? null,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt ?? activity.createdAt,
    deletedAt: activity.deletedAt ?? null,
  };
}

/**
 * Split a unified `/api/v1/activities` page into system events + comments
 * for surfaces that still render them as two UI blocks.
 */
export function splitTaskActivityFeed(activities: readonly TaskActivity[]): {
  events: TaskActivity[];
  comments: TaskComment[];
} {
  const events: TaskActivity[] = [];
  const comments: TaskComment[] = [];
  for (const activity of activities) {
    if (activity.type === "comment") {
      const comment = taskActivityToTaskComment(activity);
      if (comment) comments.push(comment);
      continue;
    }
    events.push(activity);
  }
  return { events, comments };
}

/** Comma-join for `?types=` query params. */
export function activityTypesQuery(
  types: readonly string[],
): string | undefined {
  const cleaned = types.map((value) => value.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(",") : undefined;
}
