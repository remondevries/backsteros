import { formatTrackedTimeInput } from "@backsteros/contracts";

import { getTaskDueDateYmd } from "../task-due-date";
import {
  timetrackingPeriodIncludesYmd,
  type TimetrackingPeriod,
} from "./calendar-timetracking-days";

export type TimetrackingEntryKind = "task" | "meeting";

export type TimetrackingEntry = {
  id: string;
  kind: TimetrackingEntryKind;
  title: string;
  displayId?: string | null;
  trackedDurationSeconds: number;
  groupDateYmd: string | null;
  href: string;
  isLive?: boolean;
};

export type TimetrackingEntrySource = {
  id: string;
  title: string;
  number?: number | null;
  displayId?: string | null;
  trackedDurationSeconds?: number | null;
  scheduleAt?: Date | number | string | null;
};

export function resolveTimetrackingGroupDateYmd(
  scheduleAt: Date | number | string | null | undefined,
  timeZone?: string,
): string | null {
  return getTaskDueDateYmd(scheduleAt, timeZone);
}

export function collectTimetrackingEntries(input: {
  tasks?: readonly TimetrackingEntrySource[];
  meetings?: readonly TimetrackingEntrySource[];
  taskHref?: (id: string) => string;
  meetingHref?: (id: string) => string;
  formatTaskDisplayId?: (number: number) => string;
  formatMeetingDisplayId?: (number: number) => string;
  selectedDateYmd?: string | null;
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
      href: input.taskHref?.(task.id) ?? `/task/${task.id}`,
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
      href: input.meetingHref?.(meeting.id) ?? `/meeting/${meeting.id}`,
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
  trackedDurationSeconds?: number;
};

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

function displayTitle(title: string, fallback: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
