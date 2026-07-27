"use client";

import type { MouseEvent } from "react";

import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import type { Task } from "@/lib/db/schema";
import { getTaskDisplayId } from "@/lib/task-display-id";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "@/lib/shortcuts/keyboard-nav-item";
import { shouldHandleListKeyboardActivate } from "@/lib/shortcuts/should-handle-list-keyboard-navigation";
import type { TaskStatus } from "@/lib/task-status";

import { TaskAssigneeDropdown } from "./task-assignee-dropdown";
import { TaskDueDateDropdown } from "./task-due-date-dropdown";
import { TaskPriorityDropdown } from "./task-priority-dropdown";
import { TaskStatusDropdown } from "./task-status-dropdown";

import { isKanbanInteractiveCardTarget } from "@/lib/kanban/kanban-interactive-target";
type TaskBoardCardProps = {
  task: Task;
  projectKey: string;
  contacts: AssignableContact[];
  dragging: boolean;
  keyboardHighlighted?: boolean;
  onOpen: (task: Task) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onPointerDragStart: (task: Task, event: MouseEvent<HTMLElement>) => void;
};

export function TaskBoardCard({
  task,
  projectKey,
  contacts,
  dragging,
  keyboardHighlighted = false,
  onOpen,
  onStatusChange,
  onPointerDragStart,
}: TaskBoardCardProps) {
  const displayId = getTaskDisplayId(task, projectKey);

  return (
    <li className="task-kanban-card-item">
      <div
        className={[
          "task-kanban-card",
          dragging ? "task-kanban-card--dragging" : null,
          keyboardNavItemClass(keyboardHighlighted),
        ]
          .filter(Boolean)
          .join(" ")}
        data-tauri-drag-region="false"
        {...keyboardNavItemProps(task.id)}
        role="button"
        tabIndex={0}
        onMouseDown={(event) => {
          if (event.button !== 0 || isKanbanInteractiveCardTarget(event.target)) {
            return;
          }
          onPointerDragStart(task, event);
        }}
        onClick={(event) => {
          if (event.defaultPrevented || isKanbanInteractiveCardTarget(event.target)) {
            return;
          }
          onOpen(task);
        }}
        onKeyDown={(event) => {
          if (shouldHandleListKeyboardActivate(event.nativeEvent)) {
            event.preventDefault();
            onOpen(task);
          }
        }}
      >
        <span className="task-kanban-card-top">
          <span className="task-kanban-card-id" title={displayId ?? undefined}>
            {displayId ?? "Task"}
          </span>
          <span
            className="inline-flex shrink-0"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <TaskAssigneeDropdown
              taskId={task.id}
              projectId={task.projectId}
              assigneeId={task.assigneeId}
              contacts={contacts}
              variant="icon"
            />
          </span>
        </span>

        <span className="task-kanban-card-title-row">
          <span
            className="task-kanban-card-status inline-flex shrink-0"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <TaskStatusDropdown
              taskId={task.id}
              projectId={task.projectId}
              status={task.status}
              variant="icon"
              onStatusChange={onStatusChange}
            />
          </span>
          <span className="task-kanban-card-title" title={task.title}>
            {task.title}
          </span>
        </span>

        <span className="task-kanban-card-meta">
          <span
            className="inline-flex shrink-0"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <TaskPriorityDropdown
              taskId={task.id}
              projectId={task.projectId}
              priority={task.priority}
              variant="icon"
            />
          </span>
          <span
            className="inline-flex shrink-0"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <TaskDueDateDropdown
              taskId={task.id}
              projectId={task.projectId}
              dueDate={task.dueDate}
              status={task.status}
              variant="list"
            />
          </span>
        </span>
      </div>
    </li>
  );
}
