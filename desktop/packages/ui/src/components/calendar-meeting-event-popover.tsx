"use client";

import { XIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { formatCalendarTaskScheduleLabel } from "../calendar/calendar-events.js";
import { formatMeetingDisplayId, resolveMeetingAccentColor } from "../meetings/meetings.js";
import {
  getPreferredColorSchemeSnapshot,
  subscribeToPreferredColorScheme,
} from "../tasks/task-status-color.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";

const PANEL_WIDTH = 360;
const PANEL_GAP = 10;
const VIEWPORT_PADDING = 12;

export type CalendarMeetingPopoverMeeting = {
  id: string;
  title: string;
  number: number;
  summary?: string | null;
  startAt: number | Date | string;
  endAt: number | Date | string;
};

export type CalendarMeetingEventPopoverProps = {
  open: boolean;
  meeting: CalendarMeetingPopoverMeeting | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  /** Opens the full-height meeting panel (side-panel style). */
  onOpenMeeting?: (meetingId: string) => void;
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

export function CalendarMeetingEventPopover({
  open,
  meeting,
  anchorRect,
  onClose,
  onOpenMeeting,
}: CalendarMeetingEventPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const meetingAccentColor = resolveMeetingAccentColor(colorScheme);
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
  }, [anchorRect, open, meeting?.id, updatePosition]);

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

  if (!open || !meeting || !anchorRect || typeof document === "undefined") {
    return null;
  }

  const displayId = formatMeetingDisplayId(meeting.number);
  const startAt = new Date(meeting.startAt);
  const endAt = new Date(meeting.endAt);
  const scheduleLabel = formatCalendarTaskScheduleLabel(
    Number.isNaN(startAt.getTime()) ? null : startAt,
    Number.isNaN(endAt.getTime()) ? null : endAt,
  );
  const summaryPreview = previewDescription(meeting.summary);

  return createPortal(
    <div
      ref={panelRef}
      className="calendar-task-event-popover searchable-dropdown-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-calendar-meeting-event-popover=""
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="calendar-task-event-popover__accent"
        style={{ background: meetingAccentColor }}
        aria-hidden="true"
      />
      <div className="calendar-task-event-popover__header">
        <div className="calendar-task-event-popover__schedule">
          <TaskDueDateIcon
            active
            urgency="due_today"
            size={14}
            className="calendar-task-event-popover__schedule-icon"
          />
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
          {meeting.title?.trim() || "Untitled meeting"}
        </h2>
        <div className="calendar-task-event-popover__meta">
          <span className="calendar-task-event-popover__id">{displayId}</span>
        </div>
        {summaryPreview ? (
          <p className="calendar-task-event-popover__description">
            {summaryPreview}
          </p>
        ) : null}
      </div>
      {onOpenMeeting ? (
        <div className="calendar-task-event-popover__footer">
          <button
            type="button"
            className="calendar-task-event-popover__open"
            onClick={() => {
              onOpenMeeting(meeting.id);
              onClose();
            }}
          >
            Open meeting
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
