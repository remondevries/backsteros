"use client";

import { XIcon } from "@primer/octicons-react";
import { useId, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { formatCalendarTaskScheduleLabel } from "../../calendar/calendar-events.js";
import { formatMeetingDisplayId, resolveMeetingAccentColor } from "../../meetings/meetings.js";
import {
  getPreferredColorSchemeSnapshot,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import { TaskDueDateIcon } from "../tasks/task-due-date-icon.js";
import {
  previewCalendarPopoverDescription,
  useCalendarEventPopoverPosition,
} from "./calendar-event-popover-shell.js";

const PANEL_WIDTH = 360;

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

export function CalendarMeetingEventPopover({
  open,
  meeting,
  anchorRect,
  onClose,
  onOpenMeeting,
}: CalendarMeetingEventPopoverProps) {
  const titleId = useId();
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const meetingAccentColor = resolveMeetingAccentColor(colorScheme);
  const { panelRef, panelStyle } = useCalendarEventPopoverPosition({
    open,
    anchorRect,
    onClose,
    panelWidth: PANEL_WIDTH,
    contentKey: meeting?.id ?? null,
  });

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
  const summaryPreview = previewCalendarPopoverDescription(meeting.summary);

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
