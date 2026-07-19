"use client";

import type { DragEvent, SyntheticEvent } from "react";

import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "../project-status.js";
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../task-priority.js";
import { formatTaskDueMetaLabel } from "../task-due-date.js";
import {
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../project-progress-ring.js";
import type { ProjectArea } from "../project-areas.js";
import { keyboardNavItemProps, keyboardNavListItemClass } from "../keyboard-nav-item.js";
import { ProjectOcticon } from "./project-octicon.js";
import { ProjectProgressRing } from "./project-progress-ring.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";

export type ProjectOverviewRowProject = {
  id: string;
  key: string;
  name: string;
  status: string;
  priority: number;
  area: ProjectArea | null;
  icon?: string | null;
  startDate?: number | Date | null;
  dueDate?: number | Date | null;
  sortOrder?: number;
  taskProgress?: ProjectTaskProgress;
};

export type ProjectOverviewRowProps = {
  project: ProjectOverviewRowProject;
  keyboardHighlighted?: boolean;
  onSelect?: (projectKey: string) => void;
  onStatusChange?: (projectId: string, status: ProjectStatus) => void;
  onPriorityChange?: (projectId: string, priority: number) => void;
  onStartDateChange?: (projectId: string, startDate: Date | null) => void;
  onDueDateChange?: (projectId: string, dueDate: Date | null) => void;
  /** Enable list drag-reorder when set. */
  draggable?: boolean;
  showDragInsertBefore?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLLIElement>) => void;
  onDrop?: (event: DragEvent<HTMLLIElement>) => void;
};

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function stopFieldEvent(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Projects list row — status/priority/dates interactive when handlers provided.
 */
export function ProjectOverviewRow({
  project,
  keyboardHighlighted = false,
  onSelect,
  onStatusChange,
  onPriorityChange,
  onStartDateChange,
  onDueDateChange,
  draggable = false,
  showDragInsertBefore = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: ProjectOverviewRowProps) {
  const progress = project.taskProgress ?? { total: 0, completed: 0 };
  const status = migrateLegacyProjectStatus(project.status);
  const start = toDate(project.startDate ?? null);
  const due = toDate(project.dueDate ?? null);
  const startLabel = start ? formatTaskDueMetaLabel(start) : null;
  const dueLabel = due ? formatTaskDueMetaLabel(due) : null;

  const statusOptions = PROJECT_STATUS_ORDER.map((value) => ({
    value,
    label: getProjectStatusLabel(value),
    searchTerms: value.replaceAll("_", " "),
    icon: <ProjectStatusIcon status={value} size={14} />,
  }));

  const priorityOptions = TASK_PRIORITY_ORDER.map((value) => ({
    value: String(value),
    label: getTaskPriorityLabel(value),
    icon: <TaskPriorityIcon priority={value} size={14} />,
  }));

  return (
    <li
      className={[
        "project-overview-row-item",
        showDragInsertBefore ? "project-overview-row-item--insert-before" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      {...keyboardNavItemProps(project.id)}
      onDragOver={draggable ? onDragOver : undefined}
      onDrop={draggable ? onDrop : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        data-tauri-drag-region="false"
        draggable={draggable}
        className={`project-overview-row ${keyboardNavListItemClass(keyboardHighlighted)}`}
        onClick={() => onSelect?.(project.key)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect?.(project.key);
          }
        }}
        onDragStart={draggable ? onDragStart : undefined}
        onDragEnd={draggable ? onDragEnd : undefined}
      >
        <span className="project-overview-row__name">
          <ProjectOcticon icon={project.icon} size={14} />
          <span className="project-overview-row__key">{project.key}</span>
          <span
            className="project-overview-row__status-control"
            onMouseDown={stopFieldEvent}
            onClick={stopFieldEvent}
          >
            <SearchableDropdown
              value={status}
              options={statusOptions}
              onChange={(next) => onStatusChange?.(project.id, next)}
              searchPlaceholder="Change status…"
              searchShortcutLabel="S"
              ariaLabel={`Change status: ${getProjectStatusLabel(status)}`}
              taskPropertyDropdownId="status"
              className="task-overview-row__dropdown"
              panelAlign="start"
              panelWidth={280}
              renderTrigger={({ open, disabled, triggerId, onToggle }) => (
                <button
                  type="button"
                  id={triggerId}
                  className="task-overview-row__icon-trigger"
                  title={getProjectStatusLabel(status)}
                  tabIndex={-1}
                  disabled={disabled}
                  aria-haspopup="listbox"
                  aria-expanded={open}
                  aria-label={`Change status: ${getProjectStatusLabel(status)}`}
                  onMouseDown={stopFieldEvent}
                  onClick={(event) => {
                    stopFieldEvent(event);
                    onToggle();
                  }}
                >
                  <ProjectStatusIcon status={status} size={14} />
                </button>
              )}
            />
          </span>
          <span className="project-overview-row__title">{project.name}</span>
        </span>
        <span className="project-overview-row__health" aria-hidden="true" />
        <span
          className="project-overview-row__priority"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <SearchableDropdown
            value={String(project.priority)}
            options={priorityOptions}
            onChange={(next) => onPriorityChange?.(project.id, Number(next))}
            searchPlaceholder="Change priority…"
            searchShortcutLabel="P"
            ariaLabel={`Change priority: ${getTaskPriorityLabel(project.priority)}`}
            taskPropertyDropdownId="priority"
            className="task-overview-row__dropdown"
            panelAlign="start"
            panelWidth={280}
            renderTrigger={({ open, disabled, triggerId, onToggle }) => (
              <button
                type="button"
                id={triggerId}
                className="task-overview-row__icon-trigger"
                title={getTaskPriorityLabel(project.priority)}
                tabIndex={-1}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`Change priority: ${getTaskPriorityLabel(project.priority)}`}
                onMouseDown={stopFieldEvent}
                onClick={(event) => {
                  stopFieldEvent(event);
                  onToggle();
                }}
              >
                <TaskPriorityIcon priority={project.priority} size={14} />
              </button>
            )}
          />
        </span>
        <span
          className="project-overview-row__dates"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <TaskDueDateDropdown
            dueDate={start}
            variant="list"
            noDueDateLabel="No start date"
            searchShortcutLabel="⇧S"
            taskPropertyDropdownId="startDate"
            showIcon={false}
            onDueDateChange={(next) => onStartDateChange?.(project.id, next)}
          />
          <span className="project-overview-row__dates-sep">›</span>
          <TaskDueDateDropdown
            dueDate={due}
            variant="list"
            showIcon={false}
            onDueDateChange={(next) => onDueDateChange?.(project.id, next)}
          />
        </span>
        <span className="project-overview-row__issues">
          {progress.total > 0 ? progress.total : "—"}
        </span>
        <span className="project-overview-row__status">
          <span>{formatProjectTaskProgressPercent(progress)}</span>
          <ProjectProgressRing progress={progress} size={14} />
        </span>
      </div>
      {/* Keep labels for screen readers when dates empty */}
      {!startLabel && !dueLabel ? null : null}
    </li>
  );
}

export function ProjectsListHeader() {
  return (
    <div className="project-overview-row project-overview-header" role="row">
      <span>Name</span>
      <span className="text-center">Health</span>
      <span className="text-center">Priority</span>
      <span>Dates</span>
      <span className="text-center">Issues</span>
      <span className="text-right">Status</span>
    </div>
  );
}
