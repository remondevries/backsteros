import {
  CALENDAR_MEETING_OVERLAY_PARAM,
  formatMeetingDisplayId,
  getCalendarMeetingOverlayHref,
} from "../meetings/meetings.js";
import { toApiDueDateIso } from "../tasks/task-due-date.js";
import type { InboxListItem } from "../inbox/inbox-items.js";
import { getInboxAttentionGroupKey } from "../inbox/inbox-items.js";
import { hasInboxUpdatedFlag } from "@backsteros/contracts";
import { isCalendarListPath, isCalendarPath } from "../content/content-side-panel.js";

/** Search param: meeting overlay opens as full page vs narrow panel. */
export const CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM = "meetingLayout";

export type CalendarMeetingOverlayLayout = "page" | "panel";

export function parseCalendarMeetingOverlayLayout(
  search: string,
): CalendarMeetingOverlayLayout {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return params.get(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM) === "page"
    ? "page"
    : "panel";
}

/** Merge a meeting overlay id into the current calendar search string. */
export function withCalendarMeetingSearch(
  meetingId: string,
  search = "",
): string {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  params.set(CALENDAR_MEETING_OVERLAY_PARAM, meetingId);
  const qs = params.toString();
  const path = getCalendarMeetingOverlayHref(meetingId).split("?")[0] ?? "/calendar";
  // Prefer keeping the caller on /calendar with search params (overlay mode).
  return qs ? `/calendar?${qs}` : path;
}

/** Calendar list / meetings panel (not task/meeting detail routes). */
export function isCalendarMeetingsPanelPath(pathname: string): boolean {
  return isCalendarPath(pathname) && !pathname.startsWith("/calendar/tasks/") && !pathname.startsWith("/calendar/meetings/");
}

export function formatMeetingBreadcrumbLabel(
  number: number,
  title: string | null | undefined,
): string {
  const id = formatMeetingDisplayId(number);
  const trimmed = title?.trim();
  return trimmed ? `${id} ${trimmed}` : id;
}

/** Whether the sidebar Inbox icon should show an attention / update mark. */
export function resolveInboxSidebarIndicator(
  items: readonly InboxListItem[],
): boolean {
  for (const item of items) {
    if (getInboxAttentionGroupKey(item) === "triage") return true;
    const updatedAt =
      "inboxUpdatedAt" in item ? (item as { inboxUpdatedAt?: unknown }).inboxUpdatedAt : null;
    if (hasInboxUpdatedFlag(updatedAt as string | number | Date | null | undefined)) {
      return true;
    }
  }
  return false;
}

/** Build due-date fields for task/meeting PATCH bodies. */
export function buildTaskDueDatePatch(
  dueDate: Date | string | null | undefined,
  dueEndDate?: Date | string | null,
): { dueDate: string | null; dueEndDate?: string | null } {
  const start = toApiDueDateIso(dueDate ?? null);
  if (dueEndDate === undefined) {
    return { dueDate: start };
  }
  return {
    dueDate: start,
    dueEndDate: toApiDueDateIso(dueEndDate),
  };
}

// Re-export for callers that already have calendar list helpers nearby.
export { isCalendarListPath };
