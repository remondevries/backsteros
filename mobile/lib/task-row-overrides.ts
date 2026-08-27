import { useSyncExternalStore } from "react";

type TaskRowPatch = {
  title?: string | null;
  status?: string | null;
  priority?: number | null;
  due_date?: string | null;
  due_end_date?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  display_id?: string | null;
  description?: string | null;
  agent_chat_id?: string | null;
  agent_created_at?: string | null;
  agent_inbox_approved_at?: string | null;
  tracked_duration_seconds?: number | null;
};

type Listener = () => void;

const overrides = new Map<string, TaskRowPatch>();
const listeners = new Set<Listener>();
let version = 0;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion() {
  return version;
}

/**
 * Optimistic task field overrides so lists update immediately after a patch,
 * without waiting for PowerSync watch / REST refetch.
 */
export function applyTaskRowOverride(taskId: string, patch: TaskRowPatch) {
  if (!taskId) return;
  const previous = overrides.get(taskId) ?? {};
  overrides.set(taskId, { ...previous, ...patch });
  emit();
}

export function getTaskRowOverride(taskId: string): TaskRowPatch | undefined {
  return overrides.get(taskId);
}

/** Drop override keys that already match the synced/API row. */
export function reconcileTaskRowOverride(
  taskId: string,
  row: Record<string, unknown>,
) {
  const current = overrides.get(taskId);
  if (!current) return;
  const next: TaskRowPatch = { ...current };
  let changed = false;
  for (const key of Object.keys(current) as (keyof TaskRowPatch)[]) {
    if (row[key] === current[key]) {
      delete next[key];
      changed = true;
    }
  }
  if (!changed) return;
  if (Object.keys(next).length === 0) overrides.delete(taskId);
  else overrides.set(taskId, next);
  emit();
}

export function useTaskRowOverridesVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

/** Merge a list/detail row with any pending optimistic override. */
export function withTaskRowOverride<T extends { id: string }>(row: T): T {
  const patch = overrides.get(row.id);
  if (!patch) return row;
  return { ...row, ...patch };
}

/**
 * Map camelCase API patch bodies (and sqlite fields) onto list row keys.
 */
export function taskPatchToRowFields(
  values: Record<string, unknown>,
): TaskRowPatch {
  const patch: TaskRowPatch = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "dueDate" || key === "due_date") {
      patch.due_date = (value as string | null) ?? null;
    } else if (key === "dueEndDate" || key === "due_end_date") {
      patch.due_end_date = (value as string | null) ?? null;
    } else if (key === "assigneeId" || key === "assignee_id") {
      patch.assignee_id = (value as string | null) ?? null;
    } else if (key === "assigneeName" || key === "assignee_name") {
      patch.assignee_name = (value as string | null) ?? null;
    } else if (key === "projectId" || key === "project_id") {
      patch.project_id = (value as string | null) ?? null;
    } else if (key === "projectName" || key === "project_name") {
      patch.project_name = (value as string | null) ?? null;
    } else if (key === "title") {
      patch.title = (value as string | null) ?? null;
    } else if (key === "status") {
      patch.status = (value as string | null) ?? null;
    } else if (key === "priority") {
      patch.priority = typeof value === "number" ? value : Number(value) || 0;
    } else if (key === "description") {
      patch.description = (value as string | null) ?? null;
    } else if (key === "agentInboxApproved" && value === true) {
      patch.agent_inbox_approved_at = new Date().toISOString();
    } else if (key === "agent_inbox_approved_at") {
      patch.agent_inbox_approved_at = (value as string | null) ?? null;
    } else if (key === "trackedDurationSeconds" || key === "tracked_duration_seconds") {
      patch.tracked_duration_seconds =
        typeof value === "number" ? value : value == null ? null : Number(value);
    }
  }
  return patch;
}
