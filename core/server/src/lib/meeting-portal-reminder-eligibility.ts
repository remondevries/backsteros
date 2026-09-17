import { normalizeMeetingAttendeePortalEmails } from "@backsteros/contracts";

const DEFAULT_LEAD_MS = 60 * 60 * 1000;

export type MeetingReminderCandidate = {
  startAt: Date;
  attendeeContactIds: unknown;
  attendeePortalEmails: unknown;
};

function parseAttendeeContactIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
}

/** Attendees eligible for the automatic reminder (~1h before start). */
export function contactIdsDueForPortalReminder(
  row: MeetingReminderCandidate,
  now: Date,
  leadMs = DEFAULT_LEAD_MS,
): string[] {
  const msUntilStart = row.startAt.getTime() - now.getTime();
  if (msUntilStart <= 0 || msUntilStart > leadMs) {
    return [];
  }

  const portalEmails = normalizeMeetingAttendeePortalEmails(
    row.attendeePortalEmails,
  );
  return parseAttendeeContactIds(row.attendeeContactIds).filter((contactId) => {
    const entry = portalEmails[contactId];
    if (entry?.reminderSentAt) return false;
    if (!entry?.inviteSentAt) return false;
    return true;
  });
}
