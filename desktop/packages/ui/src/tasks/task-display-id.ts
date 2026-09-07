export const INBOX_TASK_KEY = "IN";

export function formatTaskDisplayId(
  projectKey: string,
  taskNumber: number,
): string {
  return `${projectKey}-${taskNumber}`;
}

/** Coerce SQLite/API number fields to a positive int, or null when unset. */
export function coerceTaskDisplayNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export type TaskDisplayIdSource = {
  number: number | null | undefined;
  projectId?: string | null;
  contactId?: string | null;
  /** Prefer this over the second arg when both are set. */
  projectKey?: string | null;
};

export function getTaskDisplayId(
  task: TaskDisplayIdSource,
  contextKey?: string | null,
): string | null {
  const number = coerceTaskDisplayNumber(task.number);
  if (number == null) {
    return null;
  }

  const key = (task.projectKey ?? contextKey)?.trim() || null;
  if (key) {
    return formatTaskDisplayId(key, number);
  }

  if (task.contactId) {
    return null;
  }

  // Project-scoped without a resolved key cannot render KEY-N.
  if (task.projectId) {
    return null;
  }

  return formatTaskDisplayId(INBOX_TASK_KEY, number);
}
