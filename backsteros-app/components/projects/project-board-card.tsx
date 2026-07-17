"use client";

import type { MouseEvent } from "react";

import {
  getDisplayProjectIcon,
  ProjectOcticon,
} from "@/components/project-icon";
import { ProjectDueDateDropdown } from "@/components/projects/project-due-date-dropdown";
import { ProjectPriorityDropdown } from "@/components/projects/project-priority-dropdown";
import { ProjectProgressRing } from "@/components/projects/project-progress-ring";
import { ProjectStartDateDropdown } from "@/components/projects/project-start-date-dropdown";
import { ProjectStatusDropdown } from "@/components/projects/project-overview/project-status-dropdown";
import type { Project, TaskPriority } from "@/lib/db/schema";
import { isKanbanInteractiveCardTarget } from "@/lib/kanban/kanban-interactive-target";
import {
  formatProjectTaskProgressPercent,
  type ProjectTaskProgress,
} from "@/lib/project-task-progress";
import type { ProjectStatus } from "@/lib/project-status";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "@/lib/shortcuts/keyboard-nav-item";
import { shouldHandleListKeyboardActivate } from "@/lib/shortcuts/should-handle-list-keyboard-navigation";

type ProjectBoardCardProps = {
  project: Project;
  taskProgress: ProjectTaskProgress;
  dragging: boolean;
  keyboardHighlighted?: boolean;
  onOpen: (project: Project) => void;
  onStatusChange?: (status: ProjectStatus) => void;
  onPriorityChange?: (priority: TaskPriority) => void;
  onStartDateChange?: (startDate: Date | null) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onPointerDragStart: (project: Project, event: MouseEvent<HTMLElement>) => void;
};

export function ProjectBoardCard({
  project,
  taskProgress,
  dragging,
  keyboardHighlighted = false,
  onOpen,
  onStatusChange,
  onPriorityChange,
  onStartDateChange,
  onDueDateChange,
  onPointerDragStart,
}: ProjectBoardCardProps) {
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
        {...keyboardNavItemProps(project.id)}
        role="button"
        tabIndex={0}
        onMouseDown={(event) => {
          if (event.button !== 0 || isKanbanInteractiveCardTarget(event.target)) {
            return;
          }
          onPointerDragStart(project, event);
        }}
        onClick={(event) => {
          if (event.defaultPrevented || isKanbanInteractiveCardTarget(event.target)) {
            return;
          }
          onOpen(project);
        }}
        onKeyDown={(event) => {
          if (shouldHandleListKeyboardActivate(event.nativeEvent)) {
            event.preventDefault();
            onOpen(project);
          }
        }}
      >
        <span className="task-kanban-card-top">
          <span className="task-kanban-card-id" title={project.key}>
            {project.key}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <ProjectOcticon
              icon={getDisplayProjectIcon(project.icon)}
              size={14}
              className="text-foreground/70"
            />
            <span className="font-mono text-[11px] tabular-nums text-foreground/45">
              {formatProjectTaskProgressPercent(taskProgress)}
            </span>
            <ProjectProgressRing
              progress={taskProgress}
              className="shrink-0 text-foreground/25"
            />
          </span>
        </span>

        <span className="task-kanban-card-title-row">
          <span
            className="task-kanban-card-status inline-flex shrink-0"
            data-kanban-property-dropdown
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <ProjectStatusDropdown
              projectId={project.id}
              status={project.status}
              variant="icon"
              onStatusChange={onStatusChange}
            />
          </span>
          <span className="task-kanban-card-title" title={project.name}>
            {project.name}
          </span>
        </span>

        <span className="task-kanban-card-meta">
          <span
            className="inline-flex shrink-0"
            data-kanban-property-dropdown
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <ProjectPriorityDropdown
              projectId={project.id}
              priority={project.priority}
              onPriorityChange={onPriorityChange}
            />
          </span>
          <span
            className="inline-flex shrink-0 items-center gap-1"
            data-kanban-property-dropdown
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <ProjectStartDateDropdown
              projectId={project.id}
              startDate={project.startDate}
              showIcon={false}
              onStartDateChange={onStartDateChange}
            />
            <span className="text-sm text-foreground/40" aria-hidden="true">
              ›
            </span>
            <ProjectDueDateDropdown
              projectId={project.id}
              dueDate={project.dueDate}
              status={project.status}
              showIcon={false}
              onDueDateChange={onDueDateChange}
            />
          </span>
        </span>
      </div>
    </li>
  );
}
