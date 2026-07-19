"use client";

import { useMemo, type SyntheticEvent } from "react";

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
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownProjectKey,
} from "./dropdown-options.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type TaskOverviewRowTask = {
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
};

export type TaskOverviewRowProps = {
  task: TaskOverviewRowTask;
  keyboardHighlighted?: boolean;
  onSelect?: (taskId: string) => void;
  showDueMeta?: boolean;
  /** When false, hide project chip (e.g. project tasks screen). Default true. */
  showProject?: boolean;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: number) => void;
  onDueDateChange?: (taskId: string, dueDate: Date | null) => void;
  onProjectChange?: (taskId: string, projectKey: string | null) => void;
  projectOptions?: import("./searchable-dropdown.js").SearchableDropdownOption<string>[];
};

function stopFieldEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Desktop task list row — matches web TaskRow layout (priority, id, status, title, project, due).
 */
export function TaskOverviewRow({
  task,
  keyboardHighlighted = false,
  onSelect,
  showDueMeta = true,
  showProject = true,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onProjectChange,
  projectOptions = [],
}: TaskOverviewRowProps) {
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
      className="task-overview-row-item"
      {...keyboardNavItemProps(task.id)}
    >
      <div
        role="button"
        tabIndex={0}
        className={`task-overview-row ${keyboardNavListItemClass(keyboardHighlighted)}`}
        onClick={() => onSelect?.(task.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect?.(task.id);
          }
        }}
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
        <span className="task-overview-row__title">{task.title}</span>
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
      </div>
    </li>
  );
}
