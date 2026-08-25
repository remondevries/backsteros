import { formatTrackedTimeInput } from "@backsteros/contracts";

import { getTaskDueDateYmd } from "../tasks/tasks-due-filters.js";
import {
  timetrackingPeriodIncludesYmd,
  type TimetrackingPeriod,
} from "./calendar-timetracking-days.js";

export type TimetrackingEntryKind = "task" | "meeting";

export type TimetrackingEntry = {
  id: string;
  kind: TimetrackingEntryKind;
  title: string;
  displayId?: string | null;
  /** Persisted tracked total only — never live session elapsed. */
  trackedDurationSeconds: number;
  /** Local `YYYY-MM-DD` from task due date or meeting start; null when unset. */
  groupDateYmd: string | null;
  href: string;
  /** Timer is currently running; row shows live chrome, totals ignore live delta. */
  isLive?: boolean;
};

export type TimetrackingEntrySource = {
  id: string;
  title: string;
  number?: number | null;
  displayId?: string | null;
  trackedDurationSeconds?: number | null;
  /**
   * Schedule date used for day grouping:
   * task `dueDate` or meeting `startAt`.
   */
  scheduleAt?: Date | number | string | null;
};

/**
 * Day key for grouping tracked totals by schedule date (not timer session).
 */
export function resolveTimetrackingGroupDateYmd(
  scheduleAt: Date | number | string | null | undefined,
  timeZone?: string,
): string | null {
  return getTaskDueDateYmd(scheduleAt, timeZone);
}

/**
 * Collect a flat list of tracked-time entries from tasks and meetings.
 * Day grouping uses schedule dates (task due / meeting start), not timer sessions.
 */
export function collectTimetrackingEntries(input: {
  tasks?: readonly TimetrackingEntrySource[];
  meetings?: readonly TimetrackingEntrySource[];
  taskHref?: (id: string) => string;
  meetingHref?: (id: string) => string;
  formatTaskDisplayId?: (number: number) => string;
  formatMeetingDisplayId?: (number: number) => string;
  /**
   * @deprecated Prefer `period`. When set alone, filters to that local day.
   */
  selectedDateYmd?: string | null;
  /** Day / week / month filter for the main list. */
  period?: TimetrackingPeriod | null;
  timeZone?: string;
}): TimetrackingEntry[] {
  const entries: TimetrackingEntry[] = [];
  const period: TimetrackingPeriod | null =
    input.period ??
    (input.selectedDateYmd?.trim()
      ? { kind: "day", ymd: input.selectedDateYmd.trim() }
      : null);

  for (const task of input.tasks ?? []) {
    const seconds = task.trackedDurationSeconds ?? 0;
    if (seconds <= 0) continue;
    const groupDateYmd = resolveTimetrackingGroupDateYmd(
      task.scheduleAt,
      input.timeZone,
    );
    if (period && !timetrackingPeriodIncludesYmd(period, groupDateYmd)) {
      continue;
    }
    entries.push({
      id: task.id,
      kind: "task",
      title: displayTitle(task.title, "Untitled task"),
      displayId:
        task.displayId ??
        (task.number != null && input.formatTaskDisplayId
          ? input.formatTaskDisplayId(task.number)
          : null),
      trackedDurationSeconds: seconds,
      groupDateYmd,
      href: input.taskHref?.(task.id) ?? `/tasks/${task.id}`,
    });
  }

  for (const meeting of input.meetings ?? []) {
    const seconds = meeting.trackedDurationSeconds ?? 0;
    if (seconds <= 0) continue;
    const groupDateYmd = resolveTimetrackingGroupDateYmd(
      meeting.scheduleAt,
      input.timeZone,
    );
    if (period && !timetrackingPeriodIncludesYmd(period, groupDateYmd)) {
      continue;
    }
    entries.push({
      id: meeting.id,
      kind: "meeting",
      title: displayTitle(meeting.title, "Untitled meeting"),
      displayId:
        meeting.displayId ??
        (meeting.number != null && input.formatMeetingDisplayId
          ? input.formatMeetingDisplayId(meeting.number)
          : null),
      trackedDurationSeconds: seconds,
      groupDateYmd,
      href: input.meetingHref?.(meeting.id) ?? `/calendar?meeting=${meeting.id}`,
    });
  }

  return entries.sort((a, b) => {
    if (b.trackedDurationSeconds !== a.trackedDurationSeconds) {
      return b.trackedDurationSeconds - a.trackedDurationSeconds;
    }
    return a.title.localeCompare(b.title);
  });
}

export function sumTimetrackingDurationSeconds(
  entries: readonly TimetrackingEntry[],
): number {
  return entries.reduce(
    (sum, entry) => sum + Math.max(0, entry.trackedDurationSeconds),
    0,
  );
}

export type LiveTimetrackingSource = {
  id: string;
  kind: TimetrackingEntryKind;
  title: string;
  displayId?: string | null;
  href: string;
  groupDateYmd?: string | null;
  /** Persisted total when known; live elapsed is display-only. */
  trackedDurationSeconds?: number;
};

/**
 * Mark matching rows as live and prepend any running timers missing from the
 * period list (e.g. freshly started with 0 persisted seconds).
 * Live elapsed must not be written into `trackedDurationSeconds`.
 */
export function withLiveTimetrackingEntries(
  entries: readonly TimetrackingEntry[],
  liveSources: readonly LiveTimetrackingSource[],
): TimetrackingEntry[] {
  if (liveSources.length === 0) {
    return entries.map((entry) =>
      entry.isLive ? { ...entry, isLive: false } : entry,
    );
  }

  const liveByKey = new Map<string, LiveTimetrackingSource>(
    liveSources.map((source) => [`${source.kind}:${source.id}`, source]),
  );
  const present = new Set<string>();
  const merged: TimetrackingEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.kind}:${entry.id}`;
    const live = liveByKey.get(key);
    present.add(key);
    merged.push(live ? { ...entry, isLive: true } : { ...entry, isLive: false });
  }

  const liveOnly: TimetrackingEntry[] = [];
  for (const source of liveSources) {
    const key = `${source.kind}:${source.id}`;
    if (present.has(key)) continue;
    liveOnly.push({
      id: source.id,
      kind: source.kind,
      title: displayTitle(source.title, "Untitled"),
      displayId: source.displayId ?? null,
      trackedDurationSeconds: Math.max(0, source.trackedDurationSeconds ?? 0),
      groupDateYmd: source.groupDateYmd ?? null,
      href: source.href,
      isLive: true,
    });
  }

  return [...liveOnly, ...merged];
}

export function formatTimetrackingDuration(seconds: number): string {
  const formatted = formatTrackedTimeInput(seconds);
  return formatted || "00:00:00";
}

/**
 * Plain-text Timetracking stamp (title / a11y).
 * Example: `2026-08-25 · tracked 02:00:00`
 */
export function formatTimetrackingLeadingStamp(
  scheduleAt: Date | number | string | null | undefined,
  trackedDurationSeconds: number,
  timeZone?: string,
): string {
  const ymd = resolveTimetrackingGroupDateYmd(scheduleAt, timeZone);
  const duration = formatTimetrackingDuration(trackedDurationSeconds);
  if (!ymd) return `tracked ${duration}`;
  return `${ymd} · tracked ${duration}`;
}

function displayTitle(title: string, fallback: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
