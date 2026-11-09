"use client";

import { LinkExternalIcon, XIcon } from "@primer/octicons-react";
import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { formatCalendarTaskScheduleLabel } from "../../calendar/calendar-events.js";
import {
  EntityActionsMenu,
  type EntityActionsMenuItem,
} from "../entity-actions/entity-actions-menu.js";
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
  /** Remove the event from Google Calendar (and any linked Backster meeting). */
  onDelete?: (event: CalendarExternalPopoverEvent) => void | Promise<void>;
  attaching?: boolean;
  deleting?: boolean;
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
  onDelete,
  attaching = false,
  deleting = false,
}: CalendarExternalEventPopoverProps) {
  const titleId = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { panelRef, panelStyle } = useCalendarEventPopoverPosition({
    open,
    anchorRect,
    onClose,
    panelWidth: PANEL_WIDTH,
    contentKey: event?.id ?? null,
  });

  useEffect(() => {
    setConfirmDelete(false);
  }, [event?.id, open]);

  const busy = attaching || deleting;
  const htmlLink = event?.htmlLink?.trim() || null;
  const overflowItems = useMemo((): EntityActionsMenuItem[] => {
    if (!event) return [];
    const items: EntityActionsMenuItem[] = [];
    if (htmlLink) {
      items.push({
        id: "open-google",
        label: "Open in Google",
        icon: <LinkExternalIcon size={16} />,
        onSelect: () => {
          window.open(htmlLink, "_blank", "noopener,noreferrer");
        },
      });
    }
    if (onDelete) {
      items.push({
        id: "delete",
        label: deleting
          ? "Deleting…"
          : confirmDelete
            ? "Confirm delete"
            : "Delete from Google",
        danger: true,
        disabled: busy,
        onSelect: () => {
          if (!confirmDelete) {
            setConfirmDelete(true);
            return false;
          }
          onClose();
          void onDelete(event);
        },
      });
    }
    return items;
  }, [busy, confirmDelete, deleting, event, htmlLink, onClose, onDelete]);

  if (!open || !event || !anchorRect || typeof document === "undefined") {
    return null;
  }

  const scheduleLabel = scheduleLabelForExternal(event);
  const descriptionPreview = previewCalendarPopoverDescription(
    event.description,
  );
  const linkedMeetingId = event.linkedMeetingId?.trim() || null;
  const showOverflow = overflowItems.length > 0;
  const footerAction =
    linkedMeetingId && onOpenNotes ? (
      <button
        type="button"
        className="calendar-task-event-popover__open"
        disabled={busy}
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
        disabled={busy}
        onClick={() => {
          onClose();
          void onAttachNotes(event);
        }}
      >
        {attaching ? "Converting…" : "Convert to Event"}
      </button>
    ) : null;

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
        <div className="calendar-task-event-popover__header-actions">
          {showOverflow ? (
            <EntityActionsMenu
              ariaLabel="Google event actions"
              triggerAriaLabel="More actions"
              disabled={busy && !htmlLink}
              triggerClassName="calendar-task-event-popover__overflow"
              items={overflowItems}
              onOpenChange={(menuOpen) => {
                if (!menuOpen) setConfirmDelete(false);
              }}
            />
          ) : null}
          <button
            type="button"
            className="calendar-task-event-popover__close"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon size={14} />
          </button>
        </div>
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
      {footerAction ? (
        <div className="calendar-task-event-popover__footer calendar-external-event-popover__footer calendar-external-event-popover__footer--end">
          {footerAction}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
