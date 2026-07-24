"use client";

import {
  useMemo,
  type DragEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import { getTaskDisplayId } from "../task-display-id.js";
import { keyboardNavItemProps, keyboardNavListItemClass } from "../keyboard-nav-item.js";
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
import { ContactPersonIcon } from "./contact-person-icon.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";

import {
  type TaskOverviewRowTask,
} from "./task-overview-row.js";

export type { TaskOverviewRowTask };

export type TaskWorkbenchRowProps = {
  task: TaskOverviewRowTask;
  keyboardHighlighted?: boolean;
  onSelect?: (taskId: string) => void;
  showDueMeta?: boolean;
  /** When false, hide project chip (e.g. project tasks screen). Default true. */
  showProject?: boolean;
  /** When false, hide assignee control. Default true when options are provided. */
  showAssignee?: boolean;
  /** Overlay stacked on the assignee avatar (e.g. agent-session badge). */
  assigneeAccessory?: ReactNode;
  /** Shown after the title (e.g. sync loader). */
  titleTrailing?: ReactNode;
  /** `inline` = right after the title; `end` = flush right in the title area. */
  titleTrailingAlign?: "inline" | "end";
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  projectOptions?: import("./searchable-dropdown.js").SearchableDropdownOption<string>[];
  assigneeOptions?: import("./searchable-dropdown.js").SearchableDropdownOption<string>[];
  /** Enable list drag-reorder when set. */
  draggable?: boolean;
  showDragInsertBefore?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLLIElement>) => void;
  onDrop?: (event: DragEvent<HTMLLIElement>) => void;
};

function stopFieldEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Workbench task list row — assignee, drag reorder, and title trailing.
 * Separate from the desktop/web `TaskOverviewRow`.
 */
export function TaskWorkbenchRow({
  task,
  keyboardHighlighted = false,
  onSelect,
  showDueMeta = true,
  showProject = true,
  showAssignee = true,
  assigneeAccessory = null,
  titleTrailing,
  titleTrailingAlign = "inline",
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onProjectChange,
  projectOptions = [],
  assigneeOptions = [],
  draggable = false,
  showDragInsertBefore = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: TaskWorkbenchRowProps) {
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

  return (
    <li
      className={[
        "task-overview-row-item",
        showDragInsertBefore ? "task-overview-row-item--insert-before" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      {...keyboardNavItemProps(task.id)}
      onDragOver={draggable ? onDragOver : undefined}
      onDrop={draggable ? onDrop : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        data-tauri-drag-region="false"
        draggable={draggable}
        className={`task-overview-row ${keyboardNavListItemClass(keyboardHighlighted)}`}
        onClick={() => onSelect?.(task.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect?.(task.id);
          }
        }}
        onDragStart={draggable ? onDragStart : undefined}
        onDragEnd={draggable ? onDragEnd : undefined}
      >
        <span
          className="task-overview-row__priority"
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
            className="task-overview-row__dropdown"
            panelAlign="start"
            panelWidth={280}
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
                <TaskPriorityIcon priority={task.priority} size={14} />
              </button>
            )}
          />
        </span>
        {displayId ? (
          <span className="task-overview-row__id">{displayId}</span>
        ) : null}
        <span
          className="task-overview-row__status"
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
            className="task-overview-row__dropdown"
            panelAlign="start"
            panelWidth={280}
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
        <span
          className={`task-overview-row__title-wrap${
            titleTrailingAlign === "end"
              ? " task-overview-row__title-wrap--trailing-end"
              : ""
          }`}
        >
          <span className="task-overview-row__title">{task.title}</span>
          {titleTrailing ? (
            <span className="task-overview-row__title-trailing">
              {titleTrailing}
            </span>
          ) : null}
        </span>
        {showProject ? (
          projectOptions.length > 0 && onProjectChange ? (
            <span
              className="task-overview-row__project"
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
                className="task-overview-row__dropdown"
                panelAlign="end"
                panelWidth={280}
                renderTrigger={({ open, disabled, triggerId, onToggle }) => {
                  const projectLabel = task.projectName ?? "No project";
                  return (
                    <button
                      type="button"
                      id={triggerId}
                      className="task-overview-row__project-trigger"
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
                      <span className="task-overview-row__project-name">
                        {projectLabel}
                      </span>
                    </button>
                  );
                }}
              />
            </span>
          ) : task.projectName ? (
            <span className="task-overview-row__project">
              <DefaultProjectIcon size={12} />
              <span className="task-overview-row__project-name">
                {task.projectName}
              </span>
            </span>
          ) : null
        ) : null}
        {showDueMeta ? (
          <span
            className="task-overview-row__due"
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
        {showAssignee && assigneeOptions.length > 0 && onAssigneeChange ? (
          <span
            className="task-overview-row__assignee"
            onMouseDown={stopFieldEvent}
            onClick={stopFieldEvent}
          >
            <span className="task-overview-row__assignee-stack">
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
                className="task-overview-row__dropdown"
                panelAlign="end"
                panelWidth={280}
                renderTrigger={({ open, disabled, triggerId, onToggle }) => {
                  const option = assigneeOptions.find(
                    (entry) =>
                      entry.value === (task.assigneeId ?? DROPDOWN_NONE_VALUE),
                  );
                  const label = option?.label ?? "Unassigned";
                  return (
                    <button
                      type="button"
                      id={triggerId}
                      className="task-overview-row__assignee-trigger"
                      title={label}
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
                      {option?.icon ?? <ContactPersonIcon size={14} />}
                    </button>
                  );
                }}
              />
              {assigneeAccessory ? (
                <span
                  className="task-overview-row__assignee-accessory"
                  aria-hidden="true"
                >
                  {assigneeAccessory}
                </span>
              ) : null}
            </span>
          </span>
        ) : null}
      </div>
    </li>
  );
}
