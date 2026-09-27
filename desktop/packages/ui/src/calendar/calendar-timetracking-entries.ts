import { formatTrackedTimeInput } from "@backsteros/contracts";

import { isoWeekNumber, startOfWeekYmd } from "../habits/habit-month-grid.js";
import { getTaskDueDateYmd } from "../tasks/tasks-due-filters.js";
import { meetingDayGroupLabel } from "./calendar-meetings-week-groups.js";
import {
  todayYmd,
  timetrackingPeriodIncludesYmd,
  type TimetrackingPeriod,
} from "./calendar-timetracking-days.js";

export type TimetrackingEntryKind = "task" | "meeting" | "document";

export type TimetrackingEntry = {
  id: string;
  kind: TimetrackingEntryKind;
  title: string;
  displayId?: string | null;
  /** Persisted tracked total only — never live session elapsed. */
  trackedDurationSeconds: number;
  /** Local `YYYY-MM-DD` from task due date, meeting start, or document stamp. */
  groupDateYmd: string | null;
  href: string;
  /** Timer is currently running; row shows live chrome, totals ignore live delta. */
  isLive?: boolean;
  projectId?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  /** Area resolved via the entry's project: nested `areaId` when set, else top-level `area` (personal/business/clients). */
  areaId?: string | null;
  areaName?: string | null;
  /** Optional area accent color from the Areas entity. */
  areaColor?: string | null;
  /**
   * Related contacts for breakdown:
   * task `relatedContactIds`, meeting `attendeeContactIds`.
   */
  relatedContactIds?: readonly string[];
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
  projectId?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  areaColor?: string | null;
  relatedContactIds?: readonly string[] | null;
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
 * Collect a flat list of tracked-time entries from tasks, meetings, and notes.
 * Day grouping uses schedule dates (task due / meeting start / document stamp),
 * not timer sessions.
 *
 * By default only positive tracked totals are included. Pass
 * `includeZeroDurationTasks` to also keep tasks with 0 tracked seconds
 * (e.g. project reports that show completed work left untimed).
 */
export function collectTimetrackingEntries(input: {
  tasks?: readonly TimetrackingEntrySource[];
  meetings?: readonly TimetrackingEntrySource[];
  documents?: readonly TimetrackingEntrySource[];
  taskHref?: (id: string) => string;
  meetingHref?: (id: string) => string;
  documentHref?: (id: string) => string;
  formatTaskDisplayId?: (number: number) => string;
  formatMeetingDisplayId?: (number: number) => string;
  /**
   * @deprecated Prefer `period`. When set alone, filters to that local day.
   */
  selectedDateYmd?: string | null;
  /** Day / week / month filter for the main list. */
  period?: TimetrackingPeriod | null;
  timeZone?: string;
  /**
   * When true, tasks with `trackedDurationSeconds <= 0` are kept (meetings and
   * documents still require a positive total).
   */
  includeZeroDurationTasks?: boolean;
}): TimetrackingEntry[] {
  const entries: TimetrackingEntry[] = [];
  const period: TimetrackingPeriod | null =
    input.period ??
    (input.selectedDateYmd?.trim()
      ? { kind: "day", ymd: input.selectedDateYmd.trim() }
      : null);

  function pushSource(
    kind: TimetrackingEntryKind,
    source: TimetrackingEntrySource,
    href: string,
    fallbackTitle: string,
    displayId: string | null,
  ) {
    const seconds = Math.max(0, source.trackedDurationSeconds ?? 0);
    if (
      seconds <= 0 &&
      !(kind === "task" && input.includeZeroDurationTasks)
    ) {
      return;
    }
    const groupDateYmd = resolveTimetrackingGroupDateYmd(
      source.scheduleAt,
      input.timeZone,
    );
    if (period && !timetrackingPeriodIncludesYmd(period, groupDateYmd)) {
      return;
    }
    entries.push({
      id: source.id,
      kind,
      title: displayTitle(source.title, fallbackTitle),
      displayId,
      trackedDurationSeconds: seconds,
      groupDateYmd,
      href,
      projectId: source.projectId ?? null,
      projectKey: source.projectKey ?? null,
      projectName: source.projectName ?? null,
      areaId: source.areaId ?? null,
      areaName: source.areaName ?? null,
      areaColor: source.areaColor ?? null,
      relatedContactIds: normalizeContactIds(source.relatedContactIds),
    });
  }

  for (const task of input.tasks ?? []) {
    pushSource(
      "task",
      task,
      input.taskHref?.(task.id) ?? `/tasks/${task.id}`,
      "Untitled task",
      task.displayId ??
        (task.number != null && input.formatTaskDisplayId
          ? input.formatTaskDisplayId(task.number)
          : null),
    );
  }

  for (const meeting of input.meetings ?? []) {
    pushSource(
      "meeting",
      meeting,
      input.meetingHref?.(meeting.id) ?? `/calendar?meeting=${meeting.id}`,
      "Untitled meeting",
      meeting.displayId ??
        (meeting.number != null && input.formatMeetingDisplayId
          ? input.formatMeetingDisplayId(meeting.number)
          : null),
    );
  }

  for (const document of input.documents ?? []) {
    pushSource(
      "document",
      document,
      input.documentHref?.(document.id) ?? `/knowledge/${document.id}`,
      "Untitled note",
      document.displayId ?? null,
    );
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

export type WithLiveTimetrackingEntriesOptions = {
  /**
   * Selected Timetracking period. Live timers are only merged when this range
   * includes “today” (or when omitted / null).
   */
  period?: TimetrackingPeriod | null;
  /** Override for tests; defaults to local today. */
  todayYmd?: string;
};

/**
 * Mark matching rows as live and prepend any running timers missing from the
 * period list (e.g. freshly started with 0 persisted seconds).
 * Live elapsed must not be written into `trackedDurationSeconds`.
 *
 * Live chrome is limited to periods that include today — past days/weeks/months
 * keep only historically tracked rows.
 */
export function withLiveTimetrackingEntries(
  entries: readonly TimetrackingEntry[],
  liveSources: readonly LiveTimetrackingSource[],
  options?: WithLiveTimetrackingEntriesOptions,
): TimetrackingEntry[] {
  const today = options?.todayYmd ?? todayYmd();
  const period = options?.period;
  const includeLive =
    liveSources.length > 0 &&
    (period == null || timetrackingPeriodIncludesYmd(period, today));

  if (!includeLive) {
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

export type TimetrackingEntryWeekGroup = {
  /** Monday `YYYY-MM-DD`, or `__unscheduled__` when no stamp. */
  weekKey: string;
  weekNumber: number | null;
  label: string;
  entries: TimetrackingEntry[];
  totalSeconds: number;
};

export type TimetrackingEntryDayGroup = {
  /** Local `YYYY-MM-DD`, or `__unscheduled__` when no stamp. */
  dayKey: string;
  label: string;
  entries: TimetrackingEntry[];
  totalSeconds: number;
};

/** Shared shape for week/day list group headers. */
export type TimetrackingEntryListGroup = {
  key: string;
  label: string;
  entries: TimetrackingEntry[];
  totalSeconds: number;
};

/**
 * Group tracked entries by ISO week (Monday). Newest weeks first.
 * Entries without a schedule stamp land in an "Unscheduled" group at the end.
 */
export function groupTimetrackingEntriesByWeek(
  entries: readonly TimetrackingEntry[],
): TimetrackingEntryWeekGroup[] {
  const buckets = new Map<string, TimetrackingEntry[]>();

  for (const entry of entries) {
    const weekKey = entry.groupDateYmd
      ? startOfWeekYmd(entry.groupDateYmd)
      : "__unscheduled__";
    const list = buckets.get(weekKey);
    if (list) list.push(entry);
    else buckets.set(weekKey, [entry]);
  }

  const weekKeys = [...buckets.keys()].sort((a, b) => {
    if (a === "__unscheduled__") return 1;
    if (b === "__unscheduled__") return -1;
    return b.localeCompare(a);
  });

  return weekKeys.map((weekKey) => {
    const groupEntries = buckets.get(weekKey) ?? [];
    const totalSeconds = sumTimetrackingDurationSeconds(groupEntries);
    if (weekKey === "__unscheduled__") {
      return {
        weekKey,
        weekNumber: null,
        label: "Unscheduled",
        entries: groupEntries,
        totalSeconds,
      };
    }
    const weekNumber = isoWeekNumber(weekKey);
    return {
      weekKey,
      weekNumber,
      label: `Week ${weekNumber}`,
      entries: groupEntries,
      totalSeconds,
    };
  });
}

/**
 * Group tracked entries by schedule day. Newest days first.
 * Entries without a schedule stamp land in an "Unscheduled" group at the end.
 */
export function groupTimetrackingEntriesByDay(
  entries: readonly TimetrackingEntry[],
  options?: { todayYmd?: string; now?: Date },
): TimetrackingEntryDayGroup[] {
  const buckets = new Map<string, TimetrackingEntry[]>();

  for (const entry of entries) {
    const dayKey = entry.groupDateYmd?.trim() || "__unscheduled__";
    const list = buckets.get(dayKey);
    if (list) list.push(entry);
    else buckets.set(dayKey, [entry]);
  }

  const dayKeys = [...buckets.keys()].sort((a, b) => {
    if (a === "__unscheduled__") return 1;
    if (b === "__unscheduled__") return -1;
    return b.localeCompare(a);
  });

  const now = options?.now ?? new Date();

  return dayKeys.map((dayKey) => {
    const groupEntries = buckets.get(dayKey) ?? [];
    const totalSeconds = sumTimetrackingDurationSeconds(groupEntries);
    if (dayKey === "__unscheduled__") {
      return {
        dayKey,
        label: "Unscheduled",
        entries: groupEntries,
        totalSeconds,
      };
    }
    return {
      dayKey,
      label: meetingDayGroupLabel(dayKey, {
        now: options?.todayYmd
          ? parseTodayOverride(options.todayYmd, now)
          : now,
      }),
      entries: groupEntries,
      totalSeconds,
    };
  });
}

function parseTodayOverride(ymd: string, fallback: Date): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return fallback;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    fallback.getHours(),
    fallback.getMinutes(),
    fallback.getSeconds(),
    fallback.getMilliseconds(),
  );
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

function normalizeContactIds(
  ids: readonly string[] | null | undefined,
): string[] {
  if (!ids || ids.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
