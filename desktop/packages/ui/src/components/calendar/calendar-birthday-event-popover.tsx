"use client";

import { XIcon } from "@primer/octicons-react";
import { useId } from "react";
import { createPortal } from "react-dom";

import { formatCalendarTaskScheduleLabel } from "../../calendar/calendar-events.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import {
  CalendarNavIcon,
  EmailNavIcon,
  TasksNavIcon,
} from "../shell/sidebar-nav-icons.js";
import { useCalendarEventPopoverPosition } from "./calendar-event-popover-shell.js";

const PANEL_WIDTH = 360;
const BIRTHDAY_ACCENT = "#ca8a04";

export type CalendarBirthdayPopoverContact = {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  organizationName?: string | null;
  email?: string | null;
  birthday?: string | null;
  avatarSrc?: string | null;
};

export type CalendarBirthdayEventPopoverProps = {
  open: boolean;
  contact: CalendarBirthdayPopoverContact | null;
  /** Occurrence day shown in the header (local YYYY-MM-DD). */
  occurrenceDate?: string | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onViewProfile?: (contactId: string) => void;
  onAddNote?: (contactId: string) => void;
  onAddTask?: (contactId: string) => void;
  onAddMeeting?: (contactId: string) => void;
  onSendEmail?: (contactId: string) => void;
};

function BirthdayPopoverIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28.9648 28.1543"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="calendar-birthday-event-popover__cake-icon"
    >
      <path
        d="M14.3066 4.6582C15.1855 4.6582 15.8789 3.87695 15.8789 2.87109C15.8789 1.8457 15.5566 1.17188 14.9414 0.449219C14.5605-0.0195312 14.1016-0.0195312 13.7207 0.390625C13.1055 1.12305 12.7344 1.79688 12.7344 2.87109C12.7344 3.87695 13.4375 4.6582 14.3066 4.6582ZM13.6621 10.4004L14.9023 10.4004L14.9023 3.4668L13.6621 3.4668ZM6.23047 14.5117L22.3828 14.5117L22.3828 13.2715C22.3828 10.9766 21.1523 9.75586 18.8281 9.75586L9.78516 9.75586C7.4707 9.75586 6.23047 10.9766 6.23047 13.2715ZM1.98242 27.3926L26.6309 27.3926L26.6309 19.5898C26.6309 17.2852 25.4102 16.0742 23.0762 16.0742L5.53711 16.0742C3.21289 16.0742 1.98242 17.2852 1.98242 19.5898ZM14.2871 21.9824C13.0664 21.9824 12.1973 23.4375 10.4102 23.4375C8.67188 23.4375 7.85156 21.9824 6.68945 21.9824C5.51758 21.9824 4.6875 23.4375 2.41211 23.4375L1.98242 23.4375L1.98242 21.9922L2.41211 21.9922C4.18945 21.9922 5.00977 20.5469 6.68945 20.5469C8.35938 20.5469 9.02344 21.9922 10.4102 21.9922C11.9824 21.9922 12.6074 20.5469 14.2871 20.5469C15.9766 20.5469 16.582 21.9922 18.1738 21.9922C19.5605 21.9922 20.2148 20.5469 21.8848 20.5469C23.5547 20.5469 24.3848 21.9922 26.1621 21.9922L26.6309 21.9922L26.6309 23.4375L26.1621 23.4375C23.877 23.4375 23.0469 21.9824 21.8848 21.9824C20.7129 21.9824 19.8926 23.4375 18.1738 23.4375C16.377 23.4375 15.5078 21.9824 14.2871 21.9824ZM0.869141 28.1543L27.7441 28.1543C28.2129 28.1543 28.6035 27.7637 28.6035 27.2852C28.6035 26.8164 28.2129 26.4258 27.7441 26.4258L0.869141 26.4258C0.390625 26.4258 0 26.8164 0 27.2852C0 27.7637 0.390625 28.1543 0.869141 28.1543Z"
        fill="currentColor"
      />
    </svg>
  );
}

function formatJobSubtitle(contact: CalendarBirthdayPopoverContact): string | null {
  const title = contact.title?.trim() || "";
  const org = contact.organizationName?.trim() || "";
  if (title && org) return `${title} at ${org}`;
  if (title) return title;
  if (org) return org;
  return null;
}

export function CalendarBirthdayEventPopover({
  open,
  contact,
  occurrenceDate,
  anchorRect,
  onClose,
  onViewProfile,
  onAddNote,
  onAddTask,
  onAddMeeting,
  onSendEmail,
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

  const firstName =
    contact.firstName?.trim() ||
    contact.name.trim().split(/\s+/)[0] ||
    contact.name.trim() ||
    "Contact";
  const lastName =
    contact.lastName?.trim() ||
    (contact.firstName?.trim()
      ? ""
      : contact.name.trim().split(/\s+/).slice(1).join(" "));
  const jobSubtitle = formatJobSubtitle(contact);
  const scheduleLabel = occurrenceDate
    ? formatCalendarTaskScheduleLabel(`${occurrenceDate}T12:00:00`)
    : contact.birthday
      ? formatCalendarTaskScheduleLabel(`${contact.birthday}T12:00:00`)
      : "Birthday";

  const runAction = (action?: (contactId: string) => void) => {
    action?.(contact.id);
    onClose();
  };

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
          <BirthdayPopoverIcon size={14} />
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
        <div className="calendar-birthday-event-popover__person">
          <EntityAvatarIcon
            src={contact.avatarSrc}
            size={48}
            kind="contact"
            className="calendar-birthday-event-popover__avatar"
          />
          <div className="calendar-birthday-event-popover__identity">
            <h2 id={titleId} className="calendar-birthday-event-popover__name">
              <span>{firstName}</span>
              {lastName ? <span> {lastName}</span> : null}
            </h2>
            {jobSubtitle ? (
              <p className="calendar-birthday-event-popover__job">{jobSubtitle}</p>
            ) : null}
          </div>
        </div>
        <div
          className="contact-overview__actions calendar-birthday-event-popover__actions"
          role="toolbar"
          aria-label="Contact actions"
        >
          <button
            type="button"
            className="contact-overview__action"
            onClick={() => runAction(onAddNote)}
          >
            <span className="contact-overview__action-icon" aria-hidden="true">
              <ProjectOcticon icon="note" size={16} />
            </span>
            <span className="contact-overview__action-label">Add Note</span>
          </button>
          <button
            type="button"
            className="contact-overview__action"
            onClick={() => runAction(onAddTask)}
          >
            <span className="contact-overview__action-icon" aria-hidden="true">
              <TasksNavIcon />
            </span>
            <span className="contact-overview__action-label">Add Task</span>
          </button>
          <button
            type="button"
            className="contact-overview__action"
            onClick={() => runAction(onAddMeeting)}
          >
            <span className="contact-overview__action-icon" aria-hidden="true">
              <CalendarNavIcon />
            </span>
            <span className="contact-overview__action-label">Add Calendar</span>
          </button>
          <button
            type="button"
            className="contact-overview__action"
            onClick={() => runAction(onSendEmail)}
          >
            <span className="contact-overview__action-icon" aria-hidden="true">
              <EmailNavIcon size={16} />
            </span>
            <span className="contact-overview__action-label">Add E-mail</span>
          </button>
        </div>
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
