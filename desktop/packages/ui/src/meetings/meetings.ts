import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  type TaskStatusColorScheme,
} from "../tasks/task-status-color.js";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../tasks/task-status.js";
import { resolveMeetingEffectiveStatus } from "./meeting-status.js";

export const MEETING_DISPLAY_KEY = "M";

/** Same red as task due-date “today” (on_hold semantic). */
export function resolveMeetingAccentColor(
  colorScheme: TaskStatusColorScheme = getPreferredColorSchemeSnapshot(),
): string {
  return resolveTaskStatusColor("on_hold", undefined, { colorScheme });
}

/** Meeting list icon color by effective status (triage orange, else status color). */
export function resolveMeetingListIconColor(
  status: string | null | undefined,
  options?: { colorScheme?: TaskStatusColorScheme },
): string {
  const statusKey = (status?.trim() || "ready_to_start").toLowerCase();
  return resolveTaskStatusColor(statusKey, undefined, options);
}

export function formatMeetingDisplayId(meetingNumber: number): string {
  return `${MEETING_DISPLAY_KEY}-${meetingNumber}`;
}

export function parseMeetingDisplayId(displayId: string): number | null {
  const match = displayId.trim().match(/^M-(\d+)$/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export type MeetingListItem = {
  id: string;
  number: number;
  title: string;
  summary?: string | null;
  notes?: string | null;
  transcription?: string | null;
  status?: string;
  /** video_call | in_person | phone_call */
  format?: string;
  /** Free-text place when format is in_person (legacy snapshot). */
  location?: string | null;
  /** Venue organization for in-person meetings (independent of organizationId). */
  locationOrganizationId?: string | null;
  priority?: number;
  projectId?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationAvatarSrc?: string | null;
  attendeeContactIds?: string[];
  startAt: number | Date | string;
  endAt: number | Date | string;
  trackedMinutes?: number | null;
  trackedDurationSeconds?: number | null;
  inboxUpdatedAt?: number | Date | string | null;
};

export function getCalendarMeetingOverlayHref(meetingId: string): string {
  return `/calendar?${CALENDAR_MEETING_OVERLAY_PARAM}=${encodeURIComponent(meetingId)}`;
}

export function getCalendarMeetingHref(meetingId: string): string {
  return `/calendar/meetings/${encodeURIComponent(meetingId)}`;
}

/** Search param key for the calendar meeting overlay panel. */
export const CALENDAR_MEETING_OVERLAY_PARAM = "meeting";

export function parseCalendarMeetingOverlayId(
  search: string,
): string | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const value = params.get(CALENDAR_MEETING_OVERLAY_PARAM)?.trim();
  return value || null;
}

/** Default block for a newly created meeting: next rounded hour, one hour long. */
export function defaultNewMeetingTimes(now = new Date()): {
  startAt: string;
  endAt: string;
} {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

export function sortMeetingsByStart<T extends MeetingListItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aStart = new Date(a.startAt).getTime();
    const bStart = new Date(b.startAt).getTime();
    if (aStart !== bStart) return aStart - bStart;
    return a.number - b.number;
  });
}

export type MeetingStatusGroup<T extends MeetingListItem = MeetingListItem> = {
  status: TaskStatus;
  label: string;
  meetings: T[];
};

/** Status-grouped meetings (same structure as contact tasks / letters lists). */
export function groupMeetingsByStatus<T extends MeetingListItem>(
  meetings: readonly T[],
  options?: { includeEmpty?: boolean; now?: Date },
): MeetingStatusGroup<T>[] {
  const now = options?.now ?? new Date();
  const buckets = new Map<TaskStatus, T[]>();
  for (const status of TASK_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const meeting of meetings) {
    const status = migrateLegacyTaskStatus(
      resolveMeetingEffectiveStatus(meeting, now),
    );
    buckets.get(status)?.push(meeting);
  }

  const groups = TASK_STATUS_ORDER.map((status) => ({
    status,
    label: getTaskStatusLabel(status),
    meetings: sortMeetingsByStart(buckets.get(status) ?? []),
  }));

  return options?.includeEmpty
    ? groups
    : groups.filter((group) => group.meetings.length > 0);
}
