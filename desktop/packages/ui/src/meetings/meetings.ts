import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  type TaskStatusColorScheme,
} from "../tasks/task-status-color.js";

export const MEETING_DISPLAY_KEY = "M";

/** Same red as task due-date “today” (on_hold semantic). */
export function resolveMeetingAccentColor(
  colorScheme: TaskStatusColorScheme = getPreferredColorSchemeSnapshot(),
): string {
  return resolveTaskStatusColor("on_hold", undefined, { colorScheme });
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
  projectId?: string | null;
  organizationId?: string | null;
  attendeeContactIds?: string[];
  projectName?: string | null;
  startAt: number | Date | string;
  endAt: number | Date | string;
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
