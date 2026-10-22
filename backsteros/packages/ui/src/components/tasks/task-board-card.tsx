"use client";

import { memo, useMemo, type ReactNode, type SyntheticEvent } from "react";

import { getTaskDisplayId } from "../../tasks/task-display-id.js";
import { isDirectRoleButtonActivationKey } from "../../shortcuts/shortcut-guards.js";
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../../tasks/task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../../tasks/task-status.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { AssigneeListMark } from "./assignee-list-mark.js";
import { DeferredSearchableDropdown } from "../dropdowns/deferred-searchable-dropdown.js";
import { DeferredTaskDueDateDropdown } from "./deferred-task-due-date-dropdown.js";
import { InboxItemTypeIcon } from "../inbox/inbox-item-type-icon.js";
import { EmailDirectionMark } from "../../email/email-direction.js";
import { ShimmerText } from "../shared/shimmer-text.js";
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
  /** Mirrors `TaskItemRowTask.listKind`; the card only styles `"email"`. */
  listKind?: "task" | "email" | "meeting";
  emailPartyLabel?: string | null;
  emailDirection?: "sent" | "received" | null;
  emailMailboxLabel?: string | null;
  emailMailboxAvatarSrc?: string | null;
  emailUnread?: boolean;
  /** Support ticket — support-ring glyph with status color. */
  support?: boolean | null;
  /** Notification-style task — bell glyph with status color. */
  notification?: boolean | null;
};

export type TaskBoardCardProps = {
  task: TaskBoardCardTask;
  onOpen?: (taskId: string) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  assigneeOptions?: import("../dropdowns/searchable-dropdown.js").SearchableDropdownOption<string>[];
  ownerSlot?: ReactNode;
  /** Replaces the display-id cell in the top row (e.g. chat contact name). */
  topLeadingSlot?: ReactNode;
  /** Optional leading media (e.g. large contact avatar) — body content sits to its right. */
  leadingSlot?: ReactNode;
  /** When true, status icon becomes the agent-working pulse. */
  agentWorking?: boolean;
  /** Optional trailing content beside the title (e.g. agent bound badge). */
  titleTrailing?: ReactNode;
  /**
   * When true, property chips are display-only (no dropdowns) so the whole
   * card stays a single open-target — used in timetracking sessions panel.
   */
  readOnly?: boolean;
  /** Hide the due-date chip in the meta row (chat cards show age in ownerSlot). */
  showDueDate?: boolean;
  /** Show the CH-/project id in the card top row (default true). */
  showDisplayId?: boolean;
  /** Show the status icon beside the title (default true). */
  showStatus?: boolean;
  /** Show a hover pin control (workspace file editor). */
  showPin?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
};

function PinGlyph({ filled }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillOpacity={filled ? 1 : 0.55}
        d="M14.102 2.664c.628-.416 1.692-.713 2.495.09l4.647 4.648c.806.804.508 1.868.091 2.495a2.95 2.95 0 0 1-.863.85c-.334.213-.756.374-1.211.35a9 9 0 0 1-.658-.071l-.068-.01a9 9 0 0 0-.707-.073c-.504-.025-.698.06-.76.12l-2.49 2.491c-.08.08-.18.258-.256.6-.073.33-.105.736-.113 1.186-.007.432.008.874.024 1.3l.001.047c.015.423.03.855.009 1.194-.065 1.031-.868 1.79-1.658 2.141-.79.35-1.917.437-2.7-.347l-2.25-2.25L3.53 21.53a.75.75 0 1 1-1.06-1.06l4.104-4.105-2.25-2.25c-.783-.784-.697-1.91-.346-2.7.35-.79 1.11-1.593 2.14-1.658.34-.021.772-.006 1.195.009l.047.001c.426.015.868.031 1.3.024.45-.008.856-.04 1.186-.113.342-.076.52-.177.6-.257l2.49-2.49c.061-.061.146-.256.12-.76a9 9 0 0 0-.073-.707l-.009-.068a9 9 0 0 1-.071-.658c-.025-.455.136-.877.348-1.211.216-.34.515-.64.851-.863"
      />
    </svg>
  );
}

function stopFieldEvent(event: SyntheticEvent) {
  event.stopPropagation();
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
  topLeadingSlot = null,
  leadingSlot = null,
  agentWorking = false,
  titleTrailing = null,
  readOnly = false,
  showDueDate = true,
  showDisplayId = true,
  showStatus = true,
  showPin = false,
  pinned = false,
  onTogglePin,
}: TaskBoardCardProps) {
  const displayId = getTaskDisplayId(
    {
      number: task.number,
      projectId: task.projectId ?? null,
      projectKey: task.projectKey,
    },
    task.projectKey,
  );
  const status = migrateLegacyTaskStatus(task.status);
  const isEmail = task.listKind === "email";
  const canEditFields = !readOnly;
  const canEditPriority = canEditFields && Boolean(onPriorityChange);
  const canEditDueDate = canEditFields && Boolean(onDueDateChange);

  const statusOptions = useMemo(
    () =>
      TASK_STATUS_ORDER.map((value) => ({
        value,
        label: getTaskStatusLabel(value),
        searchTerms: value.replace(/_/g, " "),
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

  const body = (
    <>
      <span className="task-kanban-card-top">
        {topLeadingSlot ? (
          <span className="task-kanban-card-top-leading">{topLeadingSlot}</span>
        ) : showDisplayId ? (
          <span className="task-kanban-card-id" title={displayId ?? undefined}>
            {isEmail ? (
              <span className="task-item-row__mailbox">
                <AssigneeListMark
                  label={task.emailMailboxLabel?.trim() || "Mailbox"}
                  avatarSrc={task.emailMailboxAvatarSrc}
                  size={14}
                />
                <span className="task-item-row__mailbox-name">
                  {task.emailMailboxLabel?.trim() || "E-mail"}
                </span>
              </span>
            ) : (
              displayId ?? "Task"
            )}
          </span>
        ) : (
          <span className="task-kanban-card-id-spacer" aria-hidden="true" />
        )}
        {ownerSlot ??
          (canEditFields &&
          assigneeOptions.length > 0 &&
          onAssigneeChange ? (
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
            <span
              className="task-kanban-card-owner"
              title={
                assigneeOptions.find(
                  (entry) => entry.value === (task.assigneeId ?? "__none__"),
                )?.label ?? "Unassigned"
              }
              aria-hidden="true"
            >
              {assigneeOptions.find(
                (entry) => entry.value === (task.assigneeId ?? "__none__"),
              )?.icon ??
                (task.ownerInitials?.trim()
                  ? task.ownerInitials.trim().slice(0, 2).toUpperCase()
                  : (
                      <ContactPersonIcon size={14} />
                    ))}
            </span>
          ))}
      </span>
      {showStatus ||
      Boolean(task.title?.trim()) ||
      titleTrailing ||
      isEmail ? (
      <span className="task-kanban-card-title-row">
        {showStatus ? (
          <span
            className="task-kanban-card-status"
            onMouseDown={canEditFields ? stopFieldEvent : undefined}
            onClick={canEditFields ? stopFieldEvent : undefined}
          >
            {canEditFields && onStatusChange ? (
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
                      support={Boolean(task.support)}
                      notification={Boolean(task.notification)}
                    />
                  </button>
                )}
              />
            ) : (
              <span
                className="task-item-row__icon-trigger"
                title={getTaskStatusLabel(status)}
                aria-label={getTaskStatusLabel(status)}
              >
                <TaskStatusIcon
                  status={status}
                  size={14}
                  working={agentWorking}
                  support={Boolean(task.support)}
                  notification={Boolean(task.notification)}
                />
              </span>
            )}
          </span>
        ) : null}
        <span className="task-kanban-card-title-wrap">
          {isEmail ? (
            <span
              className="task-item-row__email-mark"
              title="E-mail"
              aria-label="E-mail"
            >
              <InboxItemTypeIcon
                kind="email"
                size={12}
                unread={task.emailUnread === true}
              />
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
              {task.emailDirection ? (
                <EmailDirectionMark
                  direction={task.emailDirection}
                  size={13}
                  className="task-item-row__email-direction"
                />
              ) : null}
              <span className="task-item-row__email-party-text">
                {task.emailPartyLabel}
              </span>
            </span>
          ) : null}
          {titleTrailing ? (
            <span className="task-kanban-card-title-trailing">
              {titleTrailing}
            </span>
          ) : null}
        </span>
      </span>
      ) : null}
      <span className="task-kanban-card-meta">
        <span
          className="task-kanban-card-meta-pill"
          onMouseDown={canEditPriority ? stopFieldEvent : undefined}
          onClick={canEditPriority ? stopFieldEvent : undefined}
        >
          {canEditPriority ? (
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
          ) : (
            <span
              className="task-item-row__icon-trigger"
              title={getTaskPriorityLabel(task.priority)}
              aria-label={getTaskPriorityLabel(task.priority)}
            >
              <TaskPriorityIcon priority={task.priority} size={12} />
            </span>
          )}
        </span>
        {showDueDate ? (
          <span
            onMouseDown={canEditDueDate ? stopFieldEvent : undefined}
            onClick={canEditDueDate ? stopFieldEvent : undefined}
          >
            {canEditDueDate ? (
              <DeferredTaskDueDateDropdown
                dueDate={task.dueDate}
                status={task.status}
                variant="list"
                onDueDateChange={onDueDateChange}
              />
            ) : (
              <DeferredTaskDueDateDropdown
                dueDate={task.dueDate}
                status={task.status}
                variant="list"
                disabled
              />
            )}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        "task-kanban-card",
        leadingSlot ? "task-kanban-card--with-leading" : null,
        readOnly ? "task-kanban-card--readonly" : null,
        showPin ? "task-kanban-card--pinnable" : null,
        pinned ? "task-kanban-card--pinned" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onOpen?.(task.id)}
      onKeyDown={(event) => {
        if (!isDirectRoleButtonActivationKey(event)) return;
        event.preventDefault();
        onOpen?.(task.id);
      }}
    >
      {showPin && onTogglePin ? (
        <button
          type="button"
          className="task-kanban-card-pin"
          aria-label={pinned ? "Unpin task" : "Pin task"}
          title={pinned ? "Unpin task" : "Pin task"}
          aria-pressed={pinned}
          tabIndex={-1}
          onMouseDown={stopFieldEvent}
          onClick={(event) => {
            stopFieldEvent(event);
            onTogglePin();
          }}
        >
          <PinGlyph filled={pinned} />
        </button>
      ) : null}
      {leadingSlot ? (
        <>
          <span className="task-kanban-card-leading">{leadingSlot}</span>
          <span className="task-kanban-card-body">{body}</span>
        </>
      ) : (
        body
      )}
    </div>
  );
}

export const TaskBoardCard = memo(TaskBoardCardComponent);
