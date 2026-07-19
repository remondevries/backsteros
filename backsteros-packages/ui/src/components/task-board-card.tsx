"use client";

import { useMemo, type ReactNode, type SyntheticEvent } from "react";

import { getTaskDisplayId } from "../task-display-id.js";
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../task-status.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type TaskBoardCardTask = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: number;
  dueDate?: number | Date | null;
  projectId?: string | null;
  projectKey?: string | null;
  ownerInitials?: string | null;
  assigneeId?: string | null;
};

export type TaskBoardCardProps = {
  task: TaskBoardCardTask;
  onOpen?: (taskId: string) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  assigneeOptions?: import("./searchable-dropdown.js").SearchableDropdownOption<string>[];
  ownerSlot?: ReactNode;
};

function stopFieldEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

function OwnerPlaceholder({ initials }: { initials?: string | null }) {
  return (
    <span className="task-kanban-card-owner" aria-hidden="true">
      {initials?.trim() ? initials.trim().slice(0, 2).toUpperCase() : "·"}
    </span>
  );
}

export function TaskBoardCard({
  task,
  onOpen,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  assigneeOptions = [],
  ownerSlot,
}: TaskBoardCardProps) {
  const displayId = getTaskDisplayId(
    {
      number: task.number,
      projectId: task.projectId ?? null,
    },
    task.projectKey,
  );
  const status = migrateLegacyTaskStatus(task.status);

  const statusOptions = useMemo(
    () =>
      TASK_STATUS_ORDER.map((value) => ({
        value,
        label: getTaskStatusLabel(value),
        searchTerms: value.replaceAll("_", " "),
        icon: <TaskStatusIcon status={value} size={18} />,
      })),
    [],
  );

  const priorityOptions = useMemo(
    () =>
      TASK_PRIORITY_ORDER.map((value) => ({
        value: String(value),
        label: getTaskPriorityLabel(value),
        icon: <TaskPriorityIcon priority={value} size={18} />,
      })),
    [],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className="task-kanban-card"
      onClick={() => onOpen?.(task.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.(task.id);
        }
      }}
    >
      <span className="task-kanban-card-top">
        <span className="task-kanban-card-id" title={displayId ?? undefined}>
          {displayId ?? "Task"}
        </span>
        {ownerSlot ??
          (assigneeOptions.length > 0 && onAssigneeChange ? (
            <span
              onMouseDown={stopFieldEvent}
              onClick={stopFieldEvent}
            >
              <SearchableDropdown
                value={task.assigneeId ?? "__none__"}
                options={assigneeOptions}
                onChange={(next) =>
                  onAssigneeChange(next === "__none__" ? null : next)
                }
                searchPlaceholder="Change assignee…"
                searchShortcutLabel="A"
                ariaLabel="Change assignee"
                taskPropertyDropdownId="assignee"
                className="task-overview-row__dropdown"
                panelAlign="end"
                renderTrigger={({ open, disabled, triggerId, onToggle }) => (
                  <button
                    type="button"
                    id={triggerId}
                    className="task-kanban-card-owner task-kanban-card-owner--button"
                    tabIndex={-1}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label="Change assignee"
                    title={
                      assigneeOptions.find(
                        (entry) =>
                          entry.value === (task.assigneeId ?? "__none__"),
                      )?.label ?? "Unassigned"
                    }
                    onMouseDown={stopFieldEvent}
                    onClick={(event) => {
                      stopFieldEvent(event);
                      onToggle();
                    }}
                  >
                    {assigneeOptions.find(
                      (entry) =>
                        entry.value === (task.assigneeId ?? "__none__"),
                    )?.icon ?? <ContactPersonIcon size={14} />}
                  </button>
                )}
              />
            </span>
          ) : (
            <OwnerPlaceholder initials={task.ownerInitials} />
          ))}
      </span>
      <span className="task-kanban-card-title-row">
        <span
          className="task-kanban-card-status"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <SearchableDropdown
            value={status}
            options={statusOptions}
            onChange={onStatusChange}
            searchPlaceholder="Change status…"
            searchShortcutLabel="S"
            ariaLabel={`Change status: ${getTaskStatusLabel(status)}`}
            taskPropertyDropdownId="status"
            className="task-overview-row__dropdown"
            panelAlign="start"
            renderTrigger={({ open, disabled, triggerId, onToggle }) => (
              <button
                type="button"
                id={triggerId}
                className="task-overview-row__icon-trigger"
                title={getTaskStatusLabel(status)}
                tabIndex={-1}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`Change status: ${getTaskStatusLabel(status)}`}
                onMouseDown={stopFieldEvent}
                onClick={(event) => {
                  stopFieldEvent(event);
                  onToggle();
                }}
              >
                <TaskStatusIcon status={status} size={14} />
              </button>
            )}
          />
        </span>
        <span className="task-kanban-card-title" title={task.title}>
          {task.title}
        </span>
      </span>
      <span className="task-kanban-card-meta">
        <span
          className="task-kanban-card-meta-pill"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <SearchableDropdown
            value={String(task.priority)}
            options={priorityOptions}
            onChange={(next) => onPriorityChange?.(Number(next))}
            searchPlaceholder="Change priority…"
            searchShortcutLabel="P"
            ariaLabel={`Change priority: ${getTaskPriorityLabel(task.priority)}`}
            taskPropertyDropdownId="priority"
            className="task-overview-row__dropdown"
            panelAlign="start"
            renderTrigger={({ open, disabled, triggerId, onToggle }) => (
              <button
                type="button"
                id={triggerId}
                className="task-overview-row__icon-trigger"
                title={getTaskPriorityLabel(task.priority)}
                tabIndex={-1}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`Change priority: ${getTaskPriorityLabel(task.priority)}`}
                onMouseDown={stopFieldEvent}
                onClick={(event) => {
                  stopFieldEvent(event);
                  onToggle();
                }}
              >
                <TaskPriorityIcon priority={task.priority} size={12} />
              </button>
            )}
          />
        </span>
        <span
          className="task-kanban-card-meta-pill"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <TaskDueDateDropdown
            dueDate={task.dueDate}
            status={task.status}
            variant="list"
            onDueDateChange={onDueDateChange}
          />
        </span>
      </span>
    </div>
  );
}
