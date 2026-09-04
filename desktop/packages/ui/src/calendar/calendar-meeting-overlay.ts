import {
  CALENDAR_MEETING_OVERLAY_PARAM,
  formatMeetingDisplayId,
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
  layout?: CalendarMeetingOverlayLayout,
): string {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  params.set(CALENDAR_MEETING_OVERLAY_PARAM, meetingId);
  const resolvedLayout =
    layout ?? parseCalendarMeetingOverlayLayout(params.toString());
  if (resolvedLayout === "page") {
    params.set(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM, "page");
  } else {
    params.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
  }
  const qs = params.toString();
  return qs ? `/calendar?${qs}` : "/calendar";
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

/** Sidebar/widget Inbox attention dot — orange / green / muted / none. */
export type InboxSidebarIndicatorTone = "none" | "muted" | "green" | "orange";

export const INBOX_SIDEBAR_INDICATOR_COLORS = {
  orange: "#ee7a47",
  green: "#34C759",
  muted: "#636366",
} as const;

const ATTENTION_GROUP_KEYS = new Set(["agents", "overdue", "triage"]);

/**
 * Pick the Inbox sidebar/widget dot color.
 * Priority: orange (agents/overdue/triage) → green (updated) → muted (other items) → none.
 */
export function resolveInboxSidebarIndicatorTone(
  items: readonly InboxListItem[],
): InboxSidebarIndicatorTone {
  if (items.length === 0) return "none";
  let hasAttention = false;
  let hasUpdated = false;
  for (const item of items) {
    if (ATTENTION_GROUP_KEYS.has(getInboxAttentionGroupKey(item))) {
      hasAttention = true;
    }
    const updatedAt =
      "inboxUpdatedAt" in item
        ? (item as { inboxUpdatedAt?: unknown }).inboxUpdatedAt
        : null;
    if (
      hasInboxUpdatedFlag(
        updatedAt as string | number | Date | null | undefined,
      )
    ) {
      hasUpdated = true;
    }
  }
  if (hasAttention) return "orange";
  if (hasUpdated) return "green";
  return "muted";
}

export function inboxSidebarIndicatorColor(
  tone: InboxSidebarIndicatorTone,
): string {
  if (tone === "none") return "";
  return INBOX_SIDEBAR_INDICATOR_COLORS[tone];
}

/** @deprecated Prefer {@link resolveInboxSidebarIndicatorTone}. */
export function resolveInboxSidebarIndicator(
  items: readonly InboxListItem[],
): boolean {
  return resolveInboxSidebarIndicatorTone(items) !== "none";
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
