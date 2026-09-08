import { useSyncExternalStore } from "react";

import type { TaskDetailModel } from "./use-task-detail";

type Listener = () => void;

const pendingById = new Map<string, TaskDetailModel>();
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
 * Seed detail for a task created locally via PowerSync so navigation does not
 * flash "Task not found" while the watch / upload catches up (desktop keeps
 * an optimistic apiTasks list for the same reason).
 */
export function rememberPendingTaskDetail(task: TaskDetailModel) {
  if (!task.id) return;
  pendingById.set(task.id, task);
  emit();
}

export function getPendingTaskDetail(
  taskId: string | undefined,
): TaskDetailModel | null {
  if (!taskId) return null;
  return pendingById.get(taskId) ?? null;
}

export function clearPendingTaskDetail(taskId: string) {
  if (!pendingById.delete(taskId)) return;
  emit();
}

export function usePendingTaskDetail(
  taskId: string | undefined,
): TaskDetailModel | null {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return getPendingTaskDetail(taskId);
}

/** Build a minimal detail model from a create-task body (camelCase). */
export function pendingTaskDetailFromCreateBody(
  id: string,
  body: Record<string, unknown>,
  extras?: {
    projectName?: string | null;
    projectKey?: string | null;
    assigneeName?: string | null;
  },
): TaskDetailModel {
  const related = body.relatedContactIds;
  const relatedOrgs = body.relatedOrganizationIds;
  return {
    id,
    number: typeof body.number === "number" ? body.number : null,
    title:
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "Untitled",
    status: typeof body.status === "string" ? body.status : "ready_to_start",
    priority: typeof body.priority === "number" ? body.priority : 0,
    due_date: typeof body.dueDate === "string" ? body.dueDate : null,
    due_end_date: typeof body.dueEndDate === "string" ? body.dueEndDate : null,
    project_id: typeof body.projectId === "string" ? body.projectId : null,
    assignee_id:
      typeof body.assigneeId === "string"
        ? body.assigneeId
        : typeof body.contactId === "string"
          ? body.contactId
          : null,
    related_contact_ids: Array.isArray(related)
      ? JSON.stringify(related)
      : null,
    related_organization_ids: Array.isArray(relatedOrgs)
      ? JSON.stringify(relatedOrgs)
      : null,
    project_name: extras?.projectName ?? null,
    project_key: extras?.projectKey ?? null,
    project_type: null,
    project_local_working_directory: null,
    assignee_name: extras?.assigneeName ?? null,
    display_id: null,
    description:
      typeof body.description === "string" ? body.description : null,
    agent_chat_id: null,
    agent_created_at: null,
    agent_inbox_approved_at: null,
    tracked_minutes: null,
    tracked_duration_seconds: null,
    links: [],
  };
}
