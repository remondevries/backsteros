"use client";

import { XIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { formatCalendarTaskScheduleLabel } from "../calendar-events.js";
import { getTaskDisplayId } from "../task-display-id.js";
import { getTaskPriorityLabel } from "../task-priority.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
} from "../task-status.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";
import { resolveTaskStatusColor } from "../task-status-color.js";

const PANEL_WIDTH = 360;
const PANEL_GAP = 10;
const VIEWPORT_PADDING = 12;

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

function previewDescription(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const plain = value
    .replace(/^#+\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  return plain.length > 220 ? `${plain.slice(0, 217)}…` : plain;
}

function positionPanel(
  anchorRect: DOMRect,
  panelWidth: number,
  panelHeight: number,
): { top: number; left: number } {
  const maxLeft = window.innerWidth - panelWidth - VIEWPORT_PADDING;
  let left = anchorRect.right + PANEL_GAP;
  if (left > maxLeft) {
    left = anchorRect.left - panelWidth - PANEL_GAP;
  }
  left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

  let top = anchorRect.top;
  const maxTop = window.innerHeight - panelHeight - VIEWPORT_PADDING;
  if (top > maxTop) {
    top = maxTop;
  }
  top = Math.max(VIEWPORT_PADDING, top);

  return { top, left };
}

export function CalendarTaskEventPopover({
  open,
  task,
  anchorRect,
  onClose,
  onOpenTask,
}: CalendarTaskEventPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });

  const updatePosition = useCallback(() => {
    if (!anchorRect) return;
    const panelHeight = panelRef.current?.offsetHeight ?? 280;
    const { top, left } = positionPanel(
      anchorRect,
      PANEL_WIDTH,
      panelHeight,
    );
    setPanelStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${PANEL_WIDTH}px`,
      visibility: "visible",
    });
  }, [anchorRect]);

  useLayoutEffect(() => {
    if (!open || !anchorRect) {
      setPanelStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(frame);
  }, [anchorRect, open, task?.id, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    function handleReposition() {
      updatePosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [onClose, open, updatePosition]);

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
  const descriptionPreview = previewDescription(task.description);
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
