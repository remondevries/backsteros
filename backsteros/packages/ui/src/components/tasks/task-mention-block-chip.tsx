"use client";

import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import type { MentionCatalogTask } from "../../mentions/mention-menu-types.js";
import { ChatCardHref } from "../chat/chat-card-navigate.js";
import {
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../../tasks/task-due-date.js";
import { getDisplayProjectIcon, ProjectOcticon } from "../projects/project-octicon.js";
import { getOptionalTaskStatusLabel } from "../../tasks/task-status.js";
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

type ChipRestProps = Omit<HTMLAttributes<HTMLElement>, "children" | "title">;

export type TaskMentionBlockChipProps = ChipRestProps & {
  task: TaskMentionBlockChipTask;
  /**
   * When set, the chip is a navigable link. Omit for non-navigating chrome
   * (e.g. chat `<details>` summary with a separate “Go to task” action).
   */
  href?: string | null;
  /** Optional native title / tooltip (defaults to display id). */
  titleAttr?: string | null;
};

function TaskMentionBlockChipContent({
  task,
}: {
  task: TaskMentionBlockChipTask;
}): ReactNode {
  const dueDateLabel =
    task.dueDate != null ? formatTaskDueMetaLabel(task.dueDate) : null;
  const label = task.title?.trim() || task.displayId;
  const statusLabel = getOptionalTaskStatusLabel(task.status);

  return (
    <>
      <TaskPriorityIcon
        priority={task.priority}
        size={14}
        className="mention-chip-lite__meta-icon"
      />
      <span className="mention-chip-lite__icon">
        <MentionLeadingIcon kind="task" status={task.status} />
      </span>
      <span className="mention-chip-lite__id">{task.displayId}</span>
      <span className="mention-chip-lite__label mention-chip-lite__label--grow">
        {label}
      </span>
      {statusLabel ? (
        <span className="mention-chip-lite__status">{statusLabel}</span>
      ) : null}
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
    </>
  );
}

/**
 * Block task card used for document `@` mentions — same chrome for email
 * agent-created tasks on the thread timeline. Forwards refs / event props so
 * HoverCard `asChild` works.
 */
export const TaskMentionBlockChip = forwardRef<
  HTMLAnchorElement | HTMLDivElement,
  TaskMentionBlockChipProps
>(function TaskMentionBlockChip(
  { task, href = null, titleAttr = null, className, ...rest },
  ref,
) {
  const title = titleAttr?.trim() || task.displayId;
  const chipClassName = [
    "mention-chip-lite",
    "mention-chip-lite--task",
    "mention-chip-lite--block",
    href ? "mention-chip-lite--link" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <ChatCardHref
        ref={ref as Ref<HTMLAnchorElement>}
        href={href}
        className={chipClassName}
        title={title}
        {...rest}
      >
        <TaskMentionBlockChipContent task={task} />
      </ChatCardHref>
    );
  }

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={chipClassName}
      title={title}
      {...rest}
    >
      <TaskMentionBlockChipContent task={task} />
    </div>
  );
});
