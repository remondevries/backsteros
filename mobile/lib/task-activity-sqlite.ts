import type { TaskActivity, TaskActivityType } from "@backsteros/contracts";

const ACTIVITY_TYPES = new Set<TaskActivityType>([
  "created",
  "status_changed",
  "assignee_changed",
  "related_contacts_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
  "agent_worked",
  "timer_started",
  "timer_stopped",
]);

export const TASK_ACTIVITIES_SQL = `
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

export type TaskActivitySqliteRow = {
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

export function sqliteRowToTaskActivity(
  row: TaskActivitySqliteRow,
): TaskActivity | null {
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
