import type { ReactNode } from "react";

import { BacksterosContactPersonIcon } from "./ContactPersonIcon";
import { BacksterosEntityAvatarIcon } from "./EntityAvatarIcon";
import { BacksterosOrganizationIcon } from "./OrganizationIcon";
import { BacksterosTaskDueDateIcon } from "./TaskDueDateIcon";
import { BacksterosTaskPriorityIcon } from "./TaskPriorityIcon";
import { BacksterosTaskStatusIcon } from "./TaskStatusIcon";
import { formatTrackedDuration } from "./trackedTime";
import { getBacksterosTaskPriorityLabel } from "./taskDetailFormat";
import { formatTaskDueMetaLabel } from "./taskDueDate";
import {
  getBacksterosTaskStatusLabel,
  isBacksterosTaskStatus,
  migrateBacksterosTaskStatus,
  type BacksterosTaskStatus,
} from "./taskStatus";
import type { BacksterosTaskActivity } from "./types";

function TasksCreatedIcon(props: { readonly size?: number; readonly className?: string }) {
  const size = props.size ?? 12;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={props.className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.25 5.25C14.2165 5.25 15 6.0335 15 7V11.75C15 13.5449 13.5449 15 11.75 15H6.75C5.7835 15 5 14.2165 5 13.25C5 12.8358 5.33579 12.5 5.75 12.5C6.16421 12.5 6.5 12.8358 6.5 13.25C6.5 13.3881 6.61193 13.5 6.75 13.5H11.75C12.7165 13.5 13.5 12.7165 13.5 11.75V7C13.5 6.86193 13.3881 6.75 13.25 6.75C12.8358 6.75 12.5 6.41421 12.5 6C12.5 5.58579 12.8358 5.25 13.25 5.25Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.1543 1.00391C9.73945 1.08421 11 2.39489 11 4V8L10.9961 8.1543C10.9184 9.68834 9.68834 10.9184 8.1543 10.9961L8 11H4L3.8457 10.9961C2.31166 10.9184 1.08163 9.68834 1.00391 8.1543L1 8V4C1 2.39489 2.26055 1.08421 3.8457 1.00391L4 1H8L8.1543 1.00391ZM4 2.5C3.17157 2.5 2.5 3.17157 2.5 4V8C2.5 8.82843 3.17157 9.5 4 9.5H8C8.82843 9.5 9.5 8.82843 9.5 8V4C9.5 3.17157 8.82843 2.5 8 2.5H4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ActivityPlayIcon(props: { readonly size?: number; readonly className?: string }) {
  const size = props.size ?? 12;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={props.className}
    >
      <path d="M4.5 2.5v11l9-5.5-9-5.5Z" />
    </svg>
  );
}

function statusLabel(value: unknown): string {
  if (typeof value !== "string") return "Unknown";
  const status = migrateBacksterosTaskStatus(value);
  return isBacksterosTaskStatus(status) ? getBacksterosTaskStatusLabel(status) : value;
}

function asTaskStatus(value: unknown): BacksterosTaskStatus | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return migrateBacksterosTaskStatus(value);
}

function priorityLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return getBacksterosTaskPriorityLabel(value);
  }
  return "No priority";
}

function dueDateLabel(value: unknown): string {
  if (value == null) return "No due date";
  if (typeof value !== "string" && typeof value !== "number") return "No due date";
  return formatTaskDueMetaLabel(value) ?? "No due date";
}

function namedValue(id: unknown, name: unknown, fallback: string): string {
  if (typeof name === "string" && name.trim()) return name.trim();
  if (id == null) return fallback;
  return fallback;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** Rich activity copy matching BacksterOS desktop `activityMessage`. */
export function renderBacksterosActivityMessage(activity: BacksterosTaskActivity): ReactNode {
  const name = <strong>{activity.actorName || "Someone"}</strong>;
  const data = activity.data;

  switch (activity.type) {
    case "created":
      return <>{name} created this task</>;
    case "status_changed":
      return (
        <>
          {name} changed status from <strong>{statusLabel(data.from)}</strong> to{" "}
          <strong>{statusLabel(data.to)}</strong>
        </>
      );
    case "assignee_changed": {
      const toName = namedValue(data.to, data.toName, "someone");
      if (data.to == null) return <>{name} unassigned this task</>;
      if (data.from == null) {
        return (
          <>
            {name} assigned this task to <strong>{toName}</strong>
          </>
        );
      }
      return (
        <>
          {name} reassigned this task to <strong>{toName}</strong>
        </>
      );
    }
    case "related_contacts_changed": {
      const toNames = stringList(data.toNames).filter((entry) => entry.trim());
      const toIds = stringList(data.to);
      if (toIds.length === 0) return <>{name} cleared related contacts</>;
      const label =
        toNames.length > 0
          ? toNames.join(", ")
          : toIds.length === 1
            ? "1 contact"
            : `${toIds.length} contacts`;
      return (
        <>
          {name} updated related contacts to <strong>{label}</strong>
        </>
      );
    }
    case "related_organizations_changed": {
      const toNames = stringList(data.toNames).filter((entry) => entry.trim());
      const toIds = stringList(data.to);
      if (toIds.length === 0) return <>{name} cleared related organizations</>;
      const label =
        toNames.length > 0
          ? toNames.join(", ")
          : toIds.length === 1
            ? "1 organization"
            : `${toIds.length} organizations`;
      return (
        <>
          {name} updated related organizations to <strong>{label}</strong>
        </>
      );
    }
    case "priority_changed":
      return (
        <>
          {name} changed priority from <strong>{priorityLabel(data.from)}</strong> to{" "}
          <strong>{priorityLabel(data.to)}</strong>
        </>
      );
    case "due_date_changed":
      return (
        <>
          {name} changed due date from <strong>{dueDateLabel(data.from)}</strong> to{" "}
          <strong>{dueDateLabel(data.to)}</strong>
        </>
      );
    case "project_changed": {
      const fromName = namedValue(data.from, data.fromName, "No project");
      const toName = namedValue(data.to, data.toName, "No project");
      return (
        <>
          {name} moved this task from <strong>{fromName}</strong> to <strong>{toName}</strong>
        </>
      );
    }
    case "title_changed":
      return <>{name} updated the title</>;
    case "description_changed":
      return <>{name} updated the description</>;
    case "timer_started":
      return <>{name} started the timer on this task</>;
    case "timer_stopped": {
      const durationSeconds =
        typeof data.durationSeconds === "number" && Number.isFinite(data.durationSeconds)
          ? Math.max(0, Math.round(data.durationSeconds))
          : 0;
      return (
        <>
          {name} tracked <strong>{formatTrackedDuration(durationSeconds)}</strong> on this task
        </>
      );
    }
    default:
      return <>{name} updated this task</>;
  }
}

export function BacksterosActivityLeadingIcon(props: {
  readonly activity: BacksterosTaskActivity;
  readonly avatarSrcByContactId?: Readonly<Record<string, string>> | undefined;
}): ReactNode {
  const { activity, avatarSrcByContactId } = props;
  const data = activity.data;

  if (activity.type === "status_changed") {
    const status = asTaskStatus(data.to);
    if (status) {
      return <BacksterosTaskStatusIcon status={status} size={12} />;
    }
  }
  if (activity.type === "priority_changed") {
    const priority = typeof data.to === "number" ? data.to : 0;
    return <BacksterosTaskPriorityIcon priority={priority} size={12} />;
  }
  if (activity.type === "due_date_changed") {
    return <BacksterosTaskDueDateIcon active={data.to != null} size={12} />;
  }
  if (activity.type === "assignee_changed") {
    const assigneeId = asOptionalString(data.to);
    const avatarSrc = assigneeId ? (avatarSrcByContactId?.[assigneeId] ?? null) : null;
    return <BacksterosEntityAvatarIcon src={avatarSrc} size={12} kind="contact" />;
  }
  if (activity.type === "related_contacts_changed") {
    return <BacksterosContactPersonIcon size={12} />;
  }
  if (activity.type === "related_organizations_changed") {
    return <BacksterosOrganizationIcon size={12} />;
  }
  if (activity.type === "created") {
    return <TasksCreatedIcon size={12} className="bos-task-activity-event__glyph" />;
  }
  if (activity.type === "timer_started" || activity.type === "timer_stopped") {
    return <ActivityPlayIcon size={12} className="bos-task-activity-event__glyph" />;
  }

  const actorContactId = asOptionalString(activity.actorContactId);
  const actorAvatar = actorContactId ? (avatarSrcByContactId?.[actorContactId] ?? null) : null;
  return <BacksterosEntityAvatarIcon src={actorAvatar} size={12} kind="contact" />;
}
