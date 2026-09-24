"use client";

import { ClientLink } from "../../shared/client-link.js";
import { CalendarIcon } from "../icons/calendar-icon.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { getDisplayProjectIcon, ProjectOcticon } from "../projects/project-octicon.js";

export type MeetingMentionBlockChipMeeting = {
  title: string;
  displayId?: string | null;
  startAt?: string | number | Date | null;
  endAt?: string | number | Date | null;
  projectName?: string | null;
  projectIcon?: string | null;
  organizationName?: string | null;
};

export type MeetingMentionBlockChipProps = {
  meeting: MeetingMentionBlockChipMeeting;
  href: string;
  titleAttr?: string | null;
};

function toDate(
  value: string | number | Date | null | undefined,
): Date | null {
  if (value == null || value === "") return null;
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** e.g. "Wed, Sep 24 · 3:00–4:00 PM" or "Wed, Sep 24 · 3:00 PM → Thu, Sep 25 · 9:00 AM" */
export function formatMeetingWhenBadge(
  startAt: string | number | Date | null | undefined,
  endAt?: string | number | Date | null,
): string | null {
  const start = toDate(startAt);
  if (!start) return null;
  const end = toDate(endAt ?? null);
  const datePart = formatDateLabel(start);
  if (!end) {
    return `${datePart} · ${formatTime(start)}`;
  }
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    return `${datePart} · ${formatTime(start)}–${formatTime(end)}`;
  }
  return `${datePart} · ${formatTime(start)} → ${formatDateLabel(end)} · ${formatTime(end)}`;
}

/**
 * Block meeting card — same chrome as task mention chips on the email
 * thread timeline when an agenda item is created.
 */
export function MeetingMentionBlockChip({
  meeting,
  href,
  titleAttr = null,
}: MeetingMentionBlockChipProps) {
  const whenLabel = formatMeetingWhenBadge(meeting.startAt, meeting.endAt);
  const label = meeting.title.trim() || "Meeting";
  const displayId = meeting.displayId?.trim() || null;

  return (
    <ClientLink
      href={href}
      className="mention-chip-lite mention-chip-lite--meeting mention-chip-lite--block mention-chip-lite--link"
      title={titleAttr?.trim() || displayId || label}
    >
      <span className="mention-chip-lite__icon" aria-hidden="true">
        <CalendarIcon size={14} />
      </span>
      {displayId ? (
        <span className="mention-chip-lite__id">{displayId}</span>
      ) : null}
      <span className="mention-chip-lite__label mention-chip-lite__label--grow">
        {label}
      </span>
      {whenLabel ? (
        <span className="mention-chip-lite__due">
          <CalendarIcon size={12} />
          <span>{whenLabel}</span>
        </span>
      ) : null}
      {meeting.projectName ? (
        <span className="mention-chip-lite__project">
          <ProjectOcticon
            icon={getDisplayProjectIcon(meeting.projectIcon)}
            size={12}
          />
          <span>{meeting.projectName}</span>
        </span>
      ) : null}
      {meeting.organizationName ? (
        <span className="mention-chip-lite__project">
          <OrganizationIcon size={12} />
          <span>{meeting.organizationName}</span>
        </span>
      ) : null}
    </ClientLink>
  );
}
