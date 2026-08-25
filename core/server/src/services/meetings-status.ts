/** User-set workflow states — never auto-advanced or reconciled from schedule. */
export const MANUAL_MEETING_STATUSES = [
  "in_review",
  "canceled",
  "duplicated",
] as const;

/** Incoming meetings (e.g. portal booking) — held until reviewed in BacksterOS. */
export const INCOMING_MEETING_STATUSES = ["triage"] as const;

/** Status assigned to meetings created via public scheduling / portal booking. */
export const EXTERNAL_MEETING_BOOKING_STATUS = "triage" as const;

export type AutoManagedMeetingStatus =
  | "triage"
  | "backlog"
  | "ready_to_start"
  | "on_hold"
  | "in_progress"
  | "completed";

export function isManualMeetingStatus(status: string): boolean {
  return (MANUAL_MEETING_STATUSES as readonly string[]).includes(status);
}

export function isIncomingMeetingStatus(status: string): boolean {
  return (INCOMING_MEETING_STATUSES as readonly string[]).includes(status);
}

/** Status implied by start/end relative to `now` (auto-managed meetings only). */
export function deriveMeetingStatusForSchedule(
  startAt: Date,
  endAt: Date,
  now = new Date(),
): AutoManagedMeetingStatus {
  if (endAt.getTime() <= now.getTime()) return "completed";
  if (startAt.getTime() <= now.getTime()) return "in_progress";
  return "on_hold";
}
