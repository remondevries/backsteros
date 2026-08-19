"use client";

import {
  useMemo,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import type { GroupedListPointerItemBind } from "../use-grouped-list-pointer-reorder.js";
import { getTaskDisplayId } from "../task-display-id.js";
import { keyboardNavItemProps, keyboardNavListItemClass } from "../keyboard-nav-item.js";
import { isDirectRoleButtonActivationKey } from "../shortcut-guards.js";
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../task-status.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownProjectKey,
} from "./dropdown-options.js";
import { AssigneeListMark } from "./assignee-list-mark.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { PolishedCheckbox } from "./polished-checkbox.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { ShimmerText } from "./shimmer-text.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";
import { Tooltip } from "./tooltip.js";

/**
 * Canonical task model for list rows (desktop, web, development console).
 * iOS keeps its own React Native row.
 */
export type TaskItemRowTask = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: number;
  dueDate: number | Date | null;
  projectId: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  contactId?: string | null;
  assigneeId?: string | null;
  ownerInitials?: string | null;
  sortOrder?: number;
  /** Epoch ms when known — used to refresh activity feeds after patches. */
  updatedAt?: number;
  /** Cursor Agent chat id bound to this task (core), if any. */
  agentChatId?: string | null;
  /** Habit definition this daily instance belongs to, if any. */
  habitId?: string | null;
  /** Set when created via API key or agent actor. */
  agentCreatedAt?: number | null;
  /** User sign-off; clears Agents inbox subgroup. */
  agentInboxApprovedAt?: number | null;
};

export type TaskItemRowProps = {
  task: TaskItemRowTask;
  keyboardHighlighted?: boolean;
  onSelect?: (taskId: string) => void;
  /**
   * Multi-select checked state (finance transaction row pattern).
   * Slot is always reserved; the control fades in on hover / focus.
   */
  selected?: boolean;
  /**
   * When true (e.g. parent list has any selection), keep the checkbox visible
   * even when the row is not hovered or focused.
   */
  forceShowCheckbox?: boolean;
  /** Toggle multi-select; receives the originating event for shift-range later. */
  onToggleSelected?: (
    taskId: string,
    checked: boolean,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  showDueMeta?: boolean;
  /** When false, hide project chip (e.g. project tasks screen). Default true. */
  showProject?: boolean;
  /** When false, hide assignee control. Default true when options are provided. */
  showAssignee?: boolean;
  /** Overlay stacked on the assignee avatar (e.g. agent-session badge). */
  assigneeAccessory?: ReactNode;
  /** Shown after the title (e.g. agent bound badge). */
  titleTrailing?: ReactNode;
  /**
   * `inline` (default) = immediately after the title text.
   * `end` = flush right in the title area.
   */
  titleTrailingAlign?: "inline" | "end";
  /** When true, status icon becomes the agent-working pulse. */
  agentWorking?: boolean;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeOptions?: SearchableDropdownOption<string>[];
  /** Extra class on the outer `<li>` (e.g. move-enter animation). */
  className?: string;
  /** Enable HTML5 list drag-reorder when set (prefer pointerReorderBind on desktop). */
  draggable?: boolean;
  showDragInsertBefore?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLLIElement>) => void;
  onDrop?: (event: DragEvent<HTMLLIElement>) => void;
  /** Pointer-based reorder bind (Tauri/WebKit-safe). */
  pointerReorderBind?: GroupedListPointerItemBind | null;
  /** True while this row is the active pointer-drag source. */
  dragging?: boolean;
};

function stopFieldEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Single shared task list item for web/desktop/console.
 * Order: checkbox → priority → id → status → title | due / project / assignee.
 */
export function TaskItemRow({
  task,
  keyboardHighlighted = false,
  onSelect,
  selected = false,
  forceShowCheckbox = false,
  onToggleSelected,
  showDueMeta = true,
  showProject = true,
  showAssignee = true,
  assigneeAccessory = null,
  titleTrailing,
  titleTrailingAlign = "inline",
  agentWorking = false,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onProjectChange,
  projectOptions = [],
  assigneeOptions = [],
  className,
  draggable = false,
  showDragInsertBefore = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  pointerReorderBind = null,
  dragging = false,
}: TaskItemRowProps) {
  const canPointerReorder = Boolean(pointerReorderBind);
  const canHtml5Drag = draggable && !canPointerReorder;
  const displayId = getTaskDisplayId(
    {
      number: task.number,
      projectId: task.projectId,
      contactId: task.contactId,
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

  const projectChip =
    showProject ? (
      projectOptions.length > 0 && onProjectChange ? (
        <span
          className="task-item-row__project"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <SearchableDropdown
            value={task.projectKey ?? DROPDOWN_NO_PROJECT_VALUE}
            options={projectOptions}
            onChange={(next) =>
              onProjectChange(task.id, resolveDropdownProjectKey(next))
            }
            searchPlaceholder="Change project…"
            searchShortcutLabel="⇧P"
            ariaLabel="Change project"
            taskPropertyDropdownId="project"
            className="task-item-row__dropdown"
            panelAlign="end"
            panelWidth={280}
            renderTrigger={({ open, disabled, triggerId, onToggle }) => {
              const projectLabel = task.projectName ?? "No project";
              return (
                <button
                  type="button"
                  id={triggerId}
                  className="task-item-row__project-trigger"
                  title={projectLabel}
                  tabIndex={-1}
                  disabled={disabled}
                  aria-haspopup="listbox"
                  aria-expanded={open}
                  aria-label={`Change project: ${projectLabel}`}
                  onMouseDown={stopFieldEvent}
                  onClick={(event) => {
                    stopFieldEvent(event);
                    onToggle();
                  }}
                >
                  <DefaultProjectIcon size={12} />
                  <span className="task-item-row__project-name">
                    {projectLabel}
                  </span>
                </button>
              );
            }}
          />
        </span>
      ) : task.projectName ? (
        <span className="task-item-row__project">
          <DefaultProjectIcon size={12} />
          <span className="task-item-row__project-name">
            {task.projectName}
          </span>
        </span>
      ) : null
    ) : null;

  const assigneeChip =
    showAssignee && assigneeOptions.length > 0 && onAssigneeChange ? (
      <span
        className="task-item-row__assignee"
        onMouseDown={stopFieldEvent}
        onClick={stopFieldEvent}
      >
        <span className="task-item-row__assignee-stack">
          <SearchableDropdown
            value={task.assigneeId ?? DROPDOWN_NONE_VALUE}
            options={assigneeOptions}
            onChange={(next) =>
              onAssigneeChange(
                task.id,
                next === DROPDOWN_NONE_VALUE ? null : next,
              )
            }
            searchPlaceholder="Change assignee…"
            searchShortcutLabel="A"
            ariaLabel="Change assignee"
            taskPropertyDropdownId="assignee"
            className="task-item-row__dropdown"
            panelAlign="end"
            panelWidth={280}
            renderTrigger={({ open, disabled, triggerId, onToggle }) => {
              const option = assigneeOptions.find(
                (entry) =>
                  entry.value === (task.assigneeId ?? DROPDOWN_NONE_VALUE),
              );
              const label = option?.label ?? "Unassigned";
              const unassigned = !task.assigneeId;
              return (
                <Tooltip label={label} disabled={open || disabled}>
                  <button
                    type="button"
                    id={triggerId}
                    className="task-item-row__assignee-trigger"
                    tabIndex={-1}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-label={`Change assignee: ${label}`}
                    onMouseDown={stopFieldEvent}
                    onClick={(event) => {
                      stopFieldEvent(event);
                      onToggle();
                    }}
                  >
                    <AssigneeListMark
                      label={label}
                      avatarSrc={option?.avatarSrc}
                      unassigned={unassigned}
                      size={18}
                    />
                  </button>
                </Tooltip>
              );
            }}
          />
          {assigneeAccessory ? (
            <span
              className="task-item-row__assignee-accessory"
              aria-hidden="true"
            >
              {assigneeAccessory}
            </span>
          ) : null}
        </span>
      </span>
    ) : null;

  return (
    <li
      className={[
        "task-item-row-item",
        showDragInsertBefore ? "task-item-row-item--insert-before" : null,
        dragging ? "task-item-row-item--dragging" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...keyboardNavItemProps(task.id)}
      onDragOver={canHtml5Drag ? onDragOver : undefined}
      onDrop={canHtml5Drag ? onDrop : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        data-tauri-drag-region="false"
        draggable={canHtml5Drag}
        className={[
          "task-item-row",
          keyboardNavListItemClass(keyboardHighlighted),
          selected ? "is-selected" : null,
          forceShowCheckbox ? "force-show-checkbox" : null,
          canPointerReorder || canHtml5Drag ? "task-item-row--draggable" : null,
          dragging ? "task-item-row--dragging" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onSelect?.(task.id)}
        onKeyDown={(event) => {
          if (!isDirectRoleButtonActivationKey(event)) return;
          event.preventDefault();
          onSelect?.(task.id);
        }}
        onDragStart={canHtml5Drag ? onDragStart : undefined}
        onDragEnd={canHtml5Drag ? onDragEnd : undefined}
        {...(pointerReorderBind ?? {})}
      >
        <span
          className="task-item-row__check"
          onClick={stopFieldEvent}
          onKeyDown={stopFieldEvent}
        >
          <PolishedCheckbox
            checked={selected}
            ariaLabel={`Select ${task.title}`}
            onCheckedChange={(checked, event) => {
              onToggleSelected?.(task.id, checked, event);
            }}
          />
        </span>

        <span
          className="task-item-row__priority"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <SearchableDropdown
            value={String(task.priority)}
            options={priorityOptions}
            onChange={(next) => onPriorityChange?.(task.id, Number(next))}
            searchPlaceholder="Change priority…"
            searchShortcutLabel="P"
            ariaLabel={`Change priority: ${getTaskPriorityLabel(task.priority)}`}
            taskPropertyDropdownId="priority"
            className="task-item-row__dropdown"
            panelAlign="start"
            panelWidth={280}
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
                <TaskPriorityIcon priority={task.priority} size={14} />
              </button>
            )}
          />
        </span>

        {displayId ? (
          <span className="task-item-row__id">{displayId}</span>
        ) : null}

        <span
          className="task-item-row__status"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <SearchableDropdown
            value={status}
            options={statusOptions}
            onChange={(next) => onStatusChange?.(task.id, next)}
            searchPlaceholder="Change status…"
            searchShortcutLabel="S"
            ariaLabel={`Change status: ${getTaskStatusLabel(status)}`}
            taskPropertyDropdownId="status"
            className="task-item-row__dropdown"
            panelAlign="start"
            panelWidth={280}
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

        <span
          className={`task-item-row__title-wrap${
            titleTrailingAlign === "end"
              ? " task-item-row__title-wrap--trailing-end"
              : ""
          }`}
        >
          <span className="task-item-row__title">
            {agentWorking ? (
              <ShimmerText>{task.title}</ShimmerText>
            ) : (
              task.title
            )}
          </span>
          {titleTrailing ? (
            <span className="task-item-row__title-trailing">
              {titleTrailing}
            </span>
          ) : null}
        </span>

        <span className="task-item-row__properties">
          {showDueMeta ? (
            <span
              className="task-item-row__due"
              onMouseDown={stopFieldEvent}
              onClick={stopFieldEvent}
            >
              <TaskDueDateDropdown
                dueDate={task.dueDate}
                status={task.status}
                variant="list"
                onDueDateChange={(next) => onDueDateChange?.(task.id, next)}
              />
            </span>
          ) : null}
          {projectChip}
          {assigneeChip}
        </span>
      </div>
    </li>
  );
}
