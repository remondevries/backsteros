import { migrateLegacyTaskStatus } from "../tasks/task-status.js";

/** User-set workflow states — never auto-advanced from schedule. */
export const MANUAL_MEETING_STATUSES = [
  "in_review",
  "canceled",
  "duplicated",
] as const;

/** Incoming meetings (e.g. portal booking) — held until reviewed in BacksterOS. */
export const INCOMING_MEETING_STATUSES = ["triage"] as const;

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

export function parseMeetingScheduleInstant(
  value: number | Date | string | null | undefined,
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Status implied by start/end relative to `now` when a meeting is rescheduled. */
export function deriveMeetingStatusForSchedule(
  startAt: Date,
  endAt: Date,
  now = new Date(),
): AutoManagedMeetingStatus {
  if (endAt.getTime() <= now.getTime()) return "completed";
  if (startAt.getTime() <= now.getTime()) return "in_progress";
  return "on_hold";
}

/**
 * Status to show and persist for a meeting: schedule-derived unless the user
 * set a manual workflow state (canceled, in review, duplicated).
 */
export function resolveMeetingEffectiveStatus(
  meeting: {
    status?: string | null;
    startAt: number | Date | string;
    endAt: number | Date | string;
  },
  now = new Date(),
): string {
  const stored = migrateLegacyTaskStatus(meeting.status ?? "ready_to_start");
  if (isManualMeetingStatus(stored) || isIncomingMeetingStatus(stored)) {
    return stored;
  }
  const start = parseMeetingScheduleInstant(meeting.startAt);
  const end = parseMeetingScheduleInstant(meeting.endAt);
  if (!start || !end || end.getTime() <= start.getTime()) return stored;
  return deriveMeetingStatusForSchedule(start, end, now);
}

/** Past end time and stored status is completed — calendar UI greys the icon. */
export function isPastCompletedMeeting(
  meeting: {
    status?: string | null;
    endAt: number | Date | string;
  },
  now = new Date(),
): boolean {
  const end = parseMeetingScheduleInstant(meeting.endAt);
  if (!end || end.getTime() > now.getTime()) return false;
  return migrateLegacyTaskStatus(meeting.status ?? "ready_to_start") === "completed";
}

export function meetingStatusNeedsReconcile(
  meeting: {
    id?: string;
    status?: string | null;
    startAt: number | Date | string;
    endAt: number | Date | string;
  },
  now = new Date(),
): string | null {
  const stored = migrateLegacyTaskStatus(meeting.status ?? "ready_to_start");
  const effective = resolveMeetingEffectiveStatus(meeting, now);
  return effective === stored ? null : effective;
}
