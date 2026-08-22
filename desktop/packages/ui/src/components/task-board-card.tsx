"use client";

import { memo, useMemo, type ReactNode, type SyntheticEvent } from "react";

import { getTaskDisplayId } from "../tasks/task-display-id.js";
import { isDirectRoleButtonActivationKey } from "../shortcuts/shortcut-guards.js";
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../tasks/task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../tasks/task-status.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { AssigneeListMark } from "./assignee-list-mark.js";
import { DeferredSearchableDropdown } from "./deferred-searchable-dropdown.js";
import { DeferredTaskDueDateDropdown } from "./deferred-task-due-date-dropdown.js";
import { InboxItemTypeIcon } from "./inbox-item-type-icon.js";
import { ShimmerText } from "./shimmer-text.js";
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
  listKind?: "task" | "email";
  emailPartyLabel?: string | null;
  emailMailboxLabel?: string | null;
  emailMailboxAvatarSrc?: string | null;
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
  /** When true, status icon becomes the agent-working pulse. */
  agentWorking?: boolean;
  /** Optional trailing content beside the title (e.g. agent bound badge). */
  titleTrailing?: ReactNode;
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

export function TaskBoardCardComponent({
  task,
  onOpen,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  assigneeOptions = [],
  ownerSlot,
  agentWorking = false,
  titleTrailing = null,
}: TaskBoardCardProps) {
  const displayId = getTaskDisplayId(
    {
      number: task.number,
      projectId: task.projectId ?? null,
    },
    task.projectKey,
  );
  const status = migrateLegacyTaskStatus(task.status);
  const isEmail = task.listKind === "email";

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
        if (!isDirectRoleButtonActivationKey(event)) return;
        event.preventDefault();
        onOpen?.(task.id);
      }}
    >
      <span className="task-kanban-card-top">
        <span className="task-kanban-card-id" title={displayId ?? undefined}>
          {isEmail ? (
            <span className="task-item-row__mailbox">
              <AssigneeListMark
                label={task.emailMailboxLabel?.trim() || "Mailbox"}
                avatarSrc={task.emailMailboxAvatarSrc}
                size={14}
              />
              <span className="task-item-row__mailbox-name">
                {task.emailMailboxLabel?.trim() || "Email"}
              </span>
            </span>
          ) : (
            displayId ?? "Task"
          )}
        </span>
        {ownerSlot ??
          (assigneeOptions.length > 0 && onAssigneeChange ? (
            <span
              onMouseDown={stopFieldEvent}
              onClick={stopFieldEvent}
            >
              <DeferredSearchableDropdown
                value={task.assigneeId ?? "__none__"}
                options={assigneeOptions}
                onChange={(next) =>
                  onAssigneeChange(next === "__none__" ? null : next)
                }
                searchPlaceholder="Change assignee…"
                searchShortcutLabel="A"
                ariaLabel="Change assignee"
                taskPropertyDropdownId="assignee"
                className="task-item-row__dropdown"
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
          <DeferredSearchableDropdown
            value={status}
            options={statusOptions}
            onChange={onStatusChange}
            searchPlaceholder="Change status…"
            searchShortcutLabel="S"
            ariaLabel={`Change status: ${getTaskStatusLabel(status)}`}
            taskPropertyDropdownId="status"
            className="task-item-row__dropdown"
            panelAlign="start"
            renderTrigger={({ open, disabled, triggerId, onToggle }) => (
              <button
                type="button"
                id={triggerId}
                className="task-item-row__icon-trigger"
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
                <TaskStatusIcon
                  status={status}
                  size={14}
                  working={agentWorking}
                />
              </button>
            )}
          />
        </span>
        <span className="task-kanban-card-title-wrap">
          {isEmail ? (
            <span
              className="task-item-row__email-mark"
              title="Email"
              aria-label="Email"
            >
              <InboxItemTypeIcon kind="email" size={12} />
            </span>
          ) : null}
          <span className="task-kanban-card-title" title={task.title}>
            {agentWorking ? (
              <ShimmerText>{task.title}</ShimmerText>
            ) : (
              task.title
            )}
          </span>
          {isEmail && task.emailPartyLabel ? (
            <span className="task-item-row__email-party">
              {task.emailPartyLabel}
            </span>
          ) : null}
          {titleTrailing ? (
            <span className="task-kanban-card-title-trailing">
              {titleTrailing}
            </span>
          ) : null}
        </span>
      </span>
      <span className="task-kanban-card-meta">
        <span
          className="task-kanban-card-meta-pill"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <DeferredSearchableDropdown
            value={String(task.priority)}
            options={priorityOptions}
            onChange={(next) => onPriorityChange?.(Number(next))}
            searchPlaceholder="Change priority…"
            searchShortcutLabel="P"
            ariaLabel={`Change priority: ${getTaskPriorityLabel(task.priority)}`}
            taskPropertyDropdownId="priority"
            className="task-item-row__dropdown"
            panelAlign="start"
            renderTrigger={({ open, disabled, triggerId, onToggle }) => (
              <button
                type="button"
                id={triggerId}
                className="task-item-row__icon-trigger"
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
          <DeferredTaskDueDateDropdown
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

export const TaskBoardCard = memo(TaskBoardCardComponent);
