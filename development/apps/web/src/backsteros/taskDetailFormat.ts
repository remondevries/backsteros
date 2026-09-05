import {
  getBacksterosTaskStatusLabel,
  isBacksterosTaskStatus,
  migrateBacksterosTaskStatus,
} from "./taskStatus";
import { formatTaskDueMetaLabel } from "./taskDueDate";
import type { BacksterosTaskActivity } from "./types";

export const BACKSTEROS_TASK_PRIORITY_LABELS = [
  "No priority",
  "Urgent",
  "High",
  "Medium",
  "Low",
] as const;

export function getBacksterosTaskPriorityLabel(priority?: number | null): string {
  if (priority == null || priority < 0 || priority > 4) {
    return BACKSTEROS_TASK_PRIORITY_LABELS[0];
  }
  return BACKSTEROS_TASK_PRIORITY_LABELS[priority] ?? BACKSTEROS_TASK_PRIORITY_LABELS[0];
}

export function formatBacksterosDueDate(value: string | null | undefined): string {
  return formatTaskDueMetaLabel(value) ?? "No due date";
}

export function formatBacksterosActivityDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatBacksterosTrackedDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

function statusLabel(value: unknown): string {
  if (typeof value !== "string") return "Unknown";
  const status = migrateBacksterosTaskStatus(value);
  return isBacksterosTaskStatus(status) ? getBacksterosTaskStatusLabel(status) : value;
}

function priorityLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return getBacksterosTaskPriorityLabel(value);
  }
  return "No priority";
}

function namedValue(id: unknown, name: unknown, fallback: string): string {
  if (typeof name === "string" && name.trim()) return name.trim();
  if (id == null) return fallback;
  return fallback;
}

/** Short human-readable activity line (mirrors BacksterOS desktop wording). */
export function formatBacksterosActivityMessage(activity: BacksterosTaskActivity): string {
  const name = activity.actorName || "Someone";
  const data = activity.data;

  switch (activity.type) {
    case "created":
      return `${name} created this task`;
    case "status_changed":
      return `${name} changed status from ${statusLabel(data.from)} to ${statusLabel(data.to)}`;
    case "assignee_changed": {
      const toName = namedValue(data.to, data.toName, "someone");
      if (data.to == null) return `${name} unassigned this task`;
      if (data.from == null) return `${name} assigned this task to ${toName}`;
      return `${name} reassigned this task to ${toName}`;
    }
    case "priority_changed":
      return `${name} changed priority from ${priorityLabel(data.from)} to ${priorityLabel(data.to)}`;
    case "due_date_changed":
      return `${name} changed due date to ${
        formatTaskDueMetaLabel(typeof data.to === "string" ? data.to : null) ?? "No due date"
      }`;
    case "title_changed":
      return `${name} updated the title`;
    case "description_changed":
      return `${name} updated the description`;
    case "timer_started":
      return `${name} started the timer on this task`;
    case "timer_stopped": {
      const durationSeconds =
        typeof data.durationSeconds === "number" && Number.isFinite(data.durationSeconds)
          ? Math.max(0, Math.round(data.durationSeconds))
          : 0;
      return `${name} tracked ${formatBacksterosTrackedDuration(durationSeconds)} on this task`;
    }
    default:
      return `${name} updated this task`;
  }
}
