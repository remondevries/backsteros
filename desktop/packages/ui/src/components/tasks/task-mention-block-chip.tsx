"use client";

import { ClientLink } from "../../shared/client-link.js";
import type { MentionCatalogTask } from "../../mentions/mention-menu-types.js";
import {
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../../tasks/task-due-date.js";
import { getDisplayProjectIcon, ProjectOcticon } from "../projects/project-octicon.js";
import { MentionLeadingIcon } from "../mentions/mention-leading-icon.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";

export type TaskMentionBlockChipTask = Pick<
  MentionCatalogTask,
  | "displayId"
  | "title"
  | "status"
  | "priority"
  | "dueDate"
  | "projectName"
  | "projectIcon"
>;

export type TaskMentionBlockChipProps = {
  task: TaskMentionBlockChipTask;
  href: string;
  /** Optional native title / tooltip (defaults to display id). */
  titleAttr?: string | null;
};

/**
 * Block task card used for document `@` mentions — same chrome for email
 * agent-created tasks on the thread timeline.
 */
export function TaskMentionBlockChip({
  task,
  href,
  titleAttr = null,
}: TaskMentionBlockChipProps) {
  const dueDateLabel =
    task.dueDate != null ? formatTaskDueMetaLabel(task.dueDate) : null;
  const label = task.title?.trim() || task.displayId;

  return (
    <ClientLink
      href={href}
      className="mention-chip-lite mention-chip-lite--task mention-chip-lite--block mention-chip-lite--link"
      title={titleAttr?.trim() || task.displayId}
    >
      <TaskPriorityIcon
        priority={task.priority}
        size={14}
        className="mention-chip-lite__meta-icon"
      />
      <span className="mention-chip-lite__icon" aria-hidden="true">
        <MentionLeadingIcon kind="task" status={task.status} />
      </span>
      <span className="mention-chip-lite__id">{task.displayId}</span>
      <span className="mention-chip-lite__label mention-chip-lite__label--grow">
        {label}
      </span>
      {dueDateLabel ? (
        <span className="mention-chip-lite__due">
          <TaskDueDateIcon
            active
            urgency={getTaskDueDateUrgency(task.dueDate, new Date(), {
              status: task.status,
            })}
            size={12}
          />
          <span>{dueDateLabel}</span>
        </span>
      ) : null}
      {task.projectName ? (
        <span className="mention-chip-lite__project">
          <ProjectOcticon
            icon={getDisplayProjectIcon(task.projectIcon)}
            size={12}
          />
          <span>{task.projectName}</span>
        </span>
      ) : null}
    </ClientLink>
  );
}
