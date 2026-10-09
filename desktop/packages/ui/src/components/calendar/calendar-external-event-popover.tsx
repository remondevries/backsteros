"use client";

import { LinkExternalIcon, XIcon } from "@primer/octicons-react";
import { useId } from "react";
import { createPortal } from "react-dom";

import { formatCalendarTaskScheduleLabel } from "../../calendar/calendar-events.js";
import { GoogleIcon } from "../icons/google-icon.js";
import {
  previewCalendarPopoverDescription,
  useCalendarEventPopoverPosition,
} from "./calendar-event-popover-shell.js";

const PANEL_WIDTH = 380;

export type CalendarExternalPopoverEvent = {
  id: string;
  provider: string;
  title: string;
  startAt?: string | null;
  endAt?: string | null;
  allDay: boolean;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  description?: string | null;
  htmlLink?: string | null;
  linkedMeetingId?: string | null;
};

export type CalendarExternalEventPopoverProps = {
  open: boolean;
  event: CalendarExternalPopoverEvent | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  /** Create a Backster meeting shell linked to this Google block. */
  onAttachNotes?: (event: CalendarExternalPopoverEvent) => void | Promise<void>;
  /** Open an existing linked meeting. */
  onOpenNotes?: (meetingId: string) => void;
  attaching?: boolean;
};

function scheduleLabelForExternal(
  event: CalendarExternalPopoverEvent,
): string | null {
  if (event.allDay && event.startDate?.trim()) {
    return formatCalendarTaskScheduleLabel(`${event.startDate.trim()}T12:00:00`);
  }
  const start = event.startAt ? new Date(event.startAt) : null;
  const end = event.endAt ? new Date(event.endAt) : null;
  return formatCalendarTaskScheduleLabel(
    start && !Number.isNaN(start.getTime()) ? start : null,
    end && !Number.isNaN(end.getTime()) ? end : null,
  );
}

function providerLabel(provider: string): string {
  if (provider === "google_calendar") return "Google Calendar";
  return provider.trim() || "External calendar";
}

export function CalendarExternalEventPopover({
  open,
  event,
  anchorRect,
  onClose,
  onAttachNotes,
  onOpenNotes,
  attaching = false,
}: CalendarExternalEventPopoverProps) {
  const titleId = useId();
  const { panelRef, panelStyle } = useCalendarEventPopoverPosition({
    open,
    anchorRect,
    onClose,
    panelWidth: PANEL_WIDTH,
    contentKey: event?.id ?? null,
  });

  if (!open || !event || !anchorRect || typeof document === "undefined") {
    return null;
  }

  const scheduleLabel = scheduleLabelForExternal(event);
  const descriptionPreview = previewCalendarPopoverDescription(
    event.description,
  );
  const linkedMeetingId = event.linkedMeetingId?.trim() || null;
  const htmlLink = event.htmlLink?.trim() || null;

  return createPortal(
    <div
      ref={panelRef}
      className="calendar-task-event-popover calendar-external-event-popover searchable-dropdown-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-calendar-external-event-popover=""
      onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
    >
      <div
        className="calendar-task-event-popover__accent calendar-external-event-popover__accent"
        aria-hidden="true"
      />
      <div className="calendar-task-event-popover__header">
        <div className="calendar-task-event-popover__schedule">
          <GoogleIcon
            size={14}
            className="calendar-external-event-popover__icon"
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
          {event.title.trim() || "(No title)"}
        </h2>
        <div className="calendar-task-event-popover__meta">
          <span className="calendar-task-event-popover__project">
            {providerLabel(event.provider)}
          </span>
        </div>
        {event.location?.trim() ? (
          <p className="calendar-external-event-popover__location">
            {event.location.trim()}
          </p>
        ) : null}
        {descriptionPreview ? (
          <p className="calendar-task-event-popover__description">
            {descriptionPreview}
          </p>
        ) : null}
        <p className="calendar-external-event-popover__hint">
          After convert, title and time sync both ways. Project, attendees, and
          notes stay in BacksterOS.
        </p>
      </div>
      <div className="calendar-task-event-popover__footer calendar-external-event-popover__footer">
        {htmlLink ? (
          <a
            className="calendar-external-event-popover__google-link"
            href={htmlLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            <LinkExternalIcon size={14} />
            Open in Google
          </a>
        ) : (
          <span />
        )}
        {linkedMeetingId && onOpenNotes ? (
          <button
            type="button"
            className="calendar-task-event-popover__open"
            onClick={() => {
              onOpenNotes(linkedMeetingId);
              onClose();
            }}
          >
            Open event
          </button>
        ) : onAttachNotes ? (
          <button
            type="button"
            className="calendar-task-event-popover__open"
            disabled={attaching}
            onClick={() => {
              onClose();
              void onAttachNotes(event);
            }}
          >
            {attaching ? "Converting…" : "Convert to Event"}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
