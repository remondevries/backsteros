"use client";

import { XIcon } from "@primer/octicons-react";
import { useId } from "react";
import { createPortal } from "react-dom";

import { formatCalendarTaskScheduleLabel } from "../../calendar/calendar-events.js";
import { getTaskDisplayId } from "../../tasks/task-display-id.js";
import { getTaskPriorityLabel } from "../../tasks/task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
} from "../../tasks/task-status.js";
import { TaskDueDateIcon } from "../tasks/task-due-date-icon.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { resolveTaskStatusColor } from "../../tasks/task-status-color.js";
import {
  previewCalendarPopoverDescription,
  useCalendarEventPopoverPosition,
} from "./calendar-event-popover-shell.js";

const PANEL_WIDTH = 360;

export type CalendarTaskPopoverTask = {
  id: string;
  title: string;
  status: string;
  priority: number;
  dueDate?: number | Date | null;
  dueEndDate?: number | Date | null;
  number?: number | null;
  projectId?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  description?: string | null;
};

export type CalendarTaskEventPopoverProps = {
  open: boolean;
  task: CalendarTaskPopoverTask | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onOpenTask?: (taskId: string) => void;
};

export function CalendarTaskEventPopover({
  open,
  task,
  anchorRect,
  onClose,
  onOpenTask,
}: CalendarTaskEventPopoverProps) {
  const titleId = useId();
  const { panelRef, panelStyle } = useCalendarEventPopoverPosition({
    open,
    anchorRect,
    onClose,
    panelWidth: PANEL_WIDTH,
    contentKey: task?.id ?? null,
  });

  if (!open || !task || !anchorRect || typeof document === "undefined") {
    return null;
  }

  const displayId = getTaskDisplayId(
    {
      number: task.number ?? null,
      projectId: task.projectId,
    },
    task.projectKey,
  );
  const scheduleLabel = formatCalendarTaskScheduleLabel(
    task.dueDate,
    task.dueEndDate,
  );
  const descriptionPreview = previewCalendarPopoverDescription(task.description);
  const statusLabel = getTaskStatusLabel(migrateLegacyTaskStatus(task.status));
  const priorityLabel = getTaskPriorityLabel(task.priority);
  const statusAccentColor = resolveTaskStatusColor(
    migrateLegacyTaskStatus(task.status),
  );

  return createPortal(
    <div
      ref={panelRef}
      className="calendar-task-event-popover searchable-dropdown-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-calendar-task-event-popover=""
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="calendar-task-event-popover__accent"
        style={{ background: statusAccentColor }}
        aria-hidden="true"
      />
      <div className="calendar-task-event-popover__header">
        <div className="calendar-task-event-popover__schedule">
          <TaskDueDateIcon size={14} className="calendar-task-event-popover__schedule-icon" />
          <span>{scheduleLabel ?? "Scheduled"}</span>
        </div>
        <button
          type="button"
          className="calendar-task-event-popover__close"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon size={14} />
        </button>
      </div>
      <div className="calendar-task-event-popover__body">
        <h2 id={titleId} className="calendar-task-event-popover__title">
          {task.title?.trim() || "Untitled task"}
        </h2>
        {(displayId || task.projectName) && (
          <div className="calendar-task-event-popover__meta">
            {displayId ? (
              <span className="calendar-task-event-popover__id">{displayId}</span>
            ) : null}
            {displayId && task.projectName ? (
              <span className="calendar-task-event-popover__dot" aria-hidden="true">
                ·
              </span>
            ) : null}
            {task.projectName ? (
              <span className="calendar-task-event-popover__project">
                {task.projectName}
              </span>
            ) : null}
          </div>
        )}
        {descriptionPreview ? (
          <p className="calendar-task-event-popover__description">
            {descriptionPreview}
          </p>
        ) : null}
        <div className="calendar-task-event-popover__properties">
          <span className="calendar-task-event-popover__property">
            <TaskStatusIcon status={task.status} size={14} />
            <span>{statusLabel}</span>
          </span>
          <span className="calendar-task-event-popover__property">
            <TaskPriorityIcon priority={task.priority} size={14} />
            <span>{priorityLabel}</span>
          </span>
        </div>
      </div>
      {onOpenTask ? (
        <div className="calendar-task-event-popover__footer">
          <button
            type="button"
            className="calendar-task-event-popover__open"
            onClick={() => {
              onOpenTask(task.id);
              onClose();
            }}
          >
            Open task
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
