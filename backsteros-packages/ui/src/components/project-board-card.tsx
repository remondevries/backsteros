"use client";

import type { SyntheticEvent } from "react";

import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "../project-status.js";
import { getTaskPriorityLabel, TASK_PRIORITY_ORDER } from "../task-priority.js";
import {
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "../project-progress-ring.js";
import type { ProjectArea } from "../project-areas.js";
import { ProjectOcticon } from "./project-octicon.js";
import { ProjectProgressRing } from "./project-progress-ring.js";
import { ProjectStatusIcon } from "./project-status-icon.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";

export type ProjectBoardCardProject = {
  id: string;
  key: string;
  name: string;
  status: string;
  priority: number;
  icon?: string | null;
  area?: ProjectArea | null;
  startDate?: number | Date | null;
  dueDate?: number | Date | null;
  taskProgress?: ProjectTaskProgress;
};

export type ProjectBoardCardProps = {
  project: ProjectBoardCardProject;
  onOpen?: (projectKey: string) => void;
  onStatusChange?: (status: ProjectStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onStartDateChange?: (startDate: Date | null) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
};

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function stopFieldEvent(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function ProjectBoardCard({
  project,
  onOpen,
  onStatusChange,
  onPriorityChange,
  onStartDateChange,
  onDueDateChange,
}: ProjectBoardCardProps) {
  const status = migrateLegacyProjectStatus(project.status);
  const progress = project.taskProgress ?? { total: 0, completed: 0 };
  const start = toDate(project.startDate ?? null);
  const due = toDate(project.dueDate ?? null);

  const statusOptions = PROJECT_STATUS_ORDER.map((value) => ({
    value,
    label: getProjectStatusLabel(value),
    searchTerms: value.replaceAll("_", " "),
    icon: <ProjectStatusIcon status={value} size={14} />,
  }));

  const priorityOptions = TASK_PRIORITY_ORDER.map((value) => ({
    value: String(value),
    label: getTaskPriorityLabel(value),
    icon: <TaskPriorityIcon priority={value} size={12} />,
  }));

  return (
    <div
      role="button"
      tabIndex={0}
      className="task-kanban-card"
      onClick={() => onOpen?.(project.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.(project.key);
        }
      }}
    >
      <span className="task-kanban-card-top">
        <span className="task-kanban-card-id" title={project.key}>
          {project.key}
        </span>
        <span className="task-kanban-card-owner">
          <ProjectOcticon icon={project.icon} size={14} />
          <span className="task-kanban-card-id">
            {formatProjectTaskProgressPercent(progress)}
          </span>
          <ProjectProgressRing progress={progress} size={14} />
        </span>
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
            ariaLabel={`Change status: ${getProjectStatusLabel(status)}`}
            taskPropertyDropdownId="status"
            className="task-overview-row__dropdown"
            panelAlign="start"
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
        <span className="task-kanban-card-title" title={project.name}>
          {project.name}
        </span>
      </span>

      <span className="task-kanban-card-meta">
        <span
          className="task-kanban-card-meta-pill"
          onMouseDown={stopFieldEvent}
          onClick={stopFieldEvent}
        >
          <SearchableDropdown
            value={String(project.priority)}
            options={priorityOptions}
            onChange={(next) => onPriorityChange?.(Number(next))}
            searchPlaceholder="Change priority…"
            searchShortcutLabel="P"
            ariaLabel={`Change priority: ${getTaskPriorityLabel(project.priority)}`}
            taskPropertyDropdownId="priority"
            className="task-overview-row__dropdown"
            panelAlign="start"
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
                <TaskPriorityIcon priority={project.priority} size={12} />
              </button>
            )}
          />
        </span>
        <span
          className="task-kanban-card-meta-pill project-board-card__dates"
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
            onDueDateChange={onStartDateChange}
          />
          <span className="project-overview-row__dates-sep">›</span>
          <TaskDueDateDropdown
            dueDate={due}
            variant="list"
            showIcon={false}
            onDueDateChange={onDueDateChange}
          />
        </span>
      </span>
    </div>
  );
}
