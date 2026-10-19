import {
  coerceTaskDisplayNumber,
  type TaskItemRowTask,
} from "@backsteros/ui";

import type { ApiProject, ApiTask } from "./core-api.js";

function asEpoch(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function parseStringIdArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((entry): entry is string => typeof entry === "string");
  return ids.length > 0 ? ids : null;
}

function numberFromTaskKey(key: string | null | undefined): number | null {
  if (!key) return null;
  const match = /-(\d+)$/.exec(key.trim());
  if (!match) return null;
  return coerceTaskDisplayNumber(match[1]);
}

export function mapTask(
  task: ApiTask,
  project: ApiProject | null,
): TaskItemRowTask {
  const workingContactId = task.agentWorkingContactId ?? null;
  return {
    id: task.id,
    number:
      coerceTaskDisplayNumber(task.number) ??
      numberFromTaskKey(task.key) ??
      0,
    title: task.title,
    status: task.status,
    priority: task.priority ?? 0,
    dueDate: asEpoch(task.dueDate),
    dueEndDate: asEpoch(task.dueEndDate ?? null),
    projectId: task.projectId ?? project?.id ?? null,
    projectKey: project?.key ?? null,
    projectName: project?.name ?? null,
    contactId: task.contactId,
    assigneeId: task.assigneeId,
    relatedContactIds: parseStringIdArray(task.relatedContactIds),
    relatedOrganizationIds: parseStringIdArray(task.relatedOrganizationIds),
    linkedEmailIds: parseStringIdArray(task.linkedEmailIds),
    labelIds: parseStringIdArray(task.labelIds),
    sortOrder: task.sortOrder ?? undefined,
    updatedAt: asEpoch(task.updatedAt) ?? undefined,
    agentChatId: task.agentChatId ?? null,
    agentWorkingContactId: workingContactId,
    agentWorkingStartedAt: asEpoch(task.agentWorkingStartedAt ?? null),
    agentWorkingLabel: task.agentWorkingLabel ?? null,
    agentWorkingKind:
      task.agentWorkingKind === "working" ||
      task.agentWorkingKind === "reviewing"
        ? task.agentWorkingKind
        : workingContactId
          ? "working"
          : null,
    agentWorkingContactName: task.agentWorkingContactName ?? null,
    linkedCommitShas: parseStringIdArray(task.linkedCommitShas),
    habitId: task.habitId ?? null,
    agentCreatedAt: asEpoch(task.agentCreatedAt),
    agentInboxApprovedAt: asEpoch(task.agentInboxApprovedAt),
    trackedMinutes: task.trackedMinutes ?? null,
    trackedDurationSeconds: task.trackedDurationSeconds ?? null,
    inboxUpdatedAt: asEpoch(task.inboxUpdatedAt),
    support: task.support ?? false,
    notification: task.notification ?? false,
    inbox: task.inbox ?? false,
  };
}
