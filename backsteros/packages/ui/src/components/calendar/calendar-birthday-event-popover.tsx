"use client";

import { XIcon } from "@primer/octicons-react";
import { useId } from "react";
import { createPortal } from "react-dom";

import { formatCalendarTaskScheduleLabel } from "../../calendar/calendar-events.js";
import {
  ContactPeekCard,
  type ContactPeekCardContact,
} from "../contacts/contact-peek-card.js";
import { BirthdayCalendarIcon } from "./birthday-calendar-icon.js";
import { useCalendarEventPopoverPosition } from "./calendar-event-popover-shell.js";

const PANEL_WIDTH = 380;
const BIRTHDAY_ACCENT = "#ca8a04";

export type CalendarBirthdayPopoverContact = ContactPeekCardContact & {
  birthday?: string | null;
};

export type CalendarBirthdayEventPopoverProps = {
  open: boolean;
  contact: CalendarBirthdayPopoverContact | null;
  /** Occurrence day shown in the header (local YYYY-MM-DD). */
  occurrenceDate?: string | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onViewProfile?: (contactId: string) => void;
  /** @deprecated Quick-action buttons removed; kept for call-site compatibility. */
  onAddNote?: (contactId: string) => void;
  /** @deprecated Quick-action buttons removed; kept for call-site compatibility. */
  onAddTask?: (contactId: string) => void;
  /** @deprecated Quick-action buttons removed; kept for call-site compatibility. */
  onAddMeeting?: (contactId: string) => void;
  /** @deprecated Quick-action buttons removed; kept for call-site compatibility. */
  onSendEmail?: (contactId: string) => void;
};

export function CalendarBirthdayEventPopover({
  open,
  contact,
  occurrenceDate,
  anchorRect,
  onClose,
  onViewProfile,
}: CalendarBirthdayEventPopoverProps) {
  const titleId = useId();
  const { panelRef, panelStyle } = useCalendarEventPopoverPosition({
    open,
    anchorRect,
    onClose,
    panelWidth: PANEL_WIDTH,
    contentKey: contact?.id ?? null,
  });

  if (!open || !contact || !anchorRect || typeof document === "undefined") {
    return null;
  }

  const scheduleLabel = occurrenceDate
    ? formatCalendarTaskScheduleLabel(`${occurrenceDate}T12:00:00`)
    : contact.birthday
      ? formatCalendarTaskScheduleLabel(`${contact.birthday}T12:00:00`)
      : "Birthday";

  return createPortal(
    <div
      ref={panelRef}
      className="calendar-task-event-popover calendar-birthday-event-popover searchable-dropdown-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-calendar-birthday-event-popover=""
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="calendar-task-event-popover__accent"
        style={{ background: BIRTHDAY_ACCENT }}
        aria-hidden="true"
      />
      <div className="calendar-task-event-popover__header">
        <div className="calendar-task-event-popover__schedule">
          <BirthdayCalendarIcon
            size={14}
            className="calendar-birthday-event-popover__cake-icon"
          />
          <span>{scheduleLabel ?? "Birthday"}</span>
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
      <div className="calendar-task-event-popover__body calendar-birthday-event-popover__body">
        <ContactPeekCard contact={contact} titleId={titleId} />
      </div>
      {onViewProfile ? (
        <div className="calendar-task-event-popover__footer">
          <button
            type="button"
            className="calendar-task-event-popover__open"
            onClick={() => {
              onViewProfile(contact.id);
              onClose();
            }}
          >
            View profile
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
