import type { TaskStatus } from "@/lib/task-status";

/**
 * Inbox lists include every task or letter with this status.
 * This is not the same as “unassigned only” (`project_id` / `contact_id` null).
 */
export const INBOX_LIST_STATUS = "triage" satisfies TaskStatus;

/** SQL `ORDER BY` for inbox task/letter queries (before `buildInboxListItems` merge sort). */
export const INBOX_LIST_SQL_ORDER = "updated_at DESC, created_at ASC";

export const INBOX_LIST_SQL_ORDER_TASKS = "tasks.updated_at DESC, tasks.created_at ASC";
export const INBOX_LIST_SQL_ORDER_LETTERS =
  "letters.updated_at DESC, letters.created_at ASC";
