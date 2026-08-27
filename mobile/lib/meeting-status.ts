import { migrateLegacyTaskStatus } from "./task-status";

export const MANUAL_MEETING_STATUSES = [
  "in_review",
  "canceled",
  "duplicated",
] as const;

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

export function deriveMeetingStatusForSchedule(
  startAt: Date,
  endAt: Date,
  now = new Date(),
): AutoManagedMeetingStatus {
  if (endAt.getTime() <= now.getTime()) return "completed";
  if (startAt.getTime() <= now.getTime()) return "in_progress";
  return "on_hold";
}

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
