import { isoWeekNumber, startOfWeekYmd } from "../habits/habit-month-grid.js";
import {
  sortMeetingsByStart,
  type MeetingListItem,
} from "../meetings/meetings.js";
import type { CalendarViewMode } from "./calendar-view-modes.js";

export type MeetingScheduleGroupGranularity = "day" | "week" | "month";

export type MeetingScheduleGroup<T extends MeetingListItem = MeetingListItem> = {
  groupKey: string;
  label: string;
  meetings: T[];
};

/** @deprecated Prefer `MeetingScheduleGroup` — kept for existing week callers. */
export type MeetingWeekGroup<T extends MeetingListItem = MeetingListItem> =
  MeetingScheduleGroup<T> & { weekKey: string };

function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function meetingStartYmd(
  startAt: number | Date | string | null | undefined,
  fallback: Date,
): string {
  if (startAt == null || startAt === "") return formatLocalYmd(fallback);
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return formatLocalYmd(fallback);
  return formatLocalYmd(date);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() + days);
  return formatLocalYmd(date);
}

function addMonthsKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(y!, m! - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey: string, now: Date): string {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(y!, m! - 1, 1);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString(undefined, {
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function formatDayLabel(ymd: string, now: Date): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Monday-start week key → `Week 38` (ISO week number). */
export function meetingWeekGroupLabel(
  weekKey: string,
  _options?: { now?: Date },
): string {
  return `Week ${isoWeekNumber(weekKey)}`;
}

/** True when `weekKey` is the Monday-start week containing `now`. */
export function isCurrentMeetingWeekGroup(
  weekKey: string,
  options?: { now?: Date },
): boolean {
  const now = options?.now ?? new Date();
  return weekKey === startOfWeekYmd(formatLocalYmd(now));
}

export function meetingDayGroupLabel(
  dayKey: string,
  options?: { now?: Date },
): string {
  const now = options?.now ?? new Date();
  const today = formatLocalYmd(now);
  if (dayKey === today) return "Today";
  if (dayKey === addDaysYmd(today, 1)) return "Tomorrow";
  if (dayKey === addDaysYmd(today, -1)) return "Yesterday";
  return formatDayLabel(dayKey, now);
}

export function meetingMonthGroupLabel(
  monthKey: string,
  options?: { now?: Date },
): string {
  const now = options?.now ?? new Date();
  const thisMonth = formatLocalYmd(now).slice(0, 7);
  if (monthKey === thisMonth) return "This month";
  if (monthKey === addMonthsKey(thisMonth, 1)) return "Next month";
  if (monthKey === addMonthsKey(thisMonth, -1)) return "Last month";
  return formatMonthLabel(monthKey, now);
}

export function meetingScheduleGroupLabel(
  groupKey: string,
  granularity: MeetingScheduleGroupGranularity,
  options?: { now?: Date },
): string {
  if (granularity === "day") return meetingDayGroupLabel(groupKey, options);
  if (granularity === "month") return meetingMonthGroupLabel(groupKey, options);
  return meetingWeekGroupLabel(groupKey, options);
}

/** Whether this schedule group is the user’s current day / week / month. */
export function isCurrentMeetingScheduleGroup(
  groupKey: string,
  granularity: MeetingScheduleGroupGranularity,
  options?: { now?: Date },
): boolean {
  const now = options?.now ?? new Date();
  const today = formatLocalYmd(now);
  if (granularity === "day") return groupKey === today;
  if (granularity === "month") return groupKey === today.slice(0, 7);
  return isCurrentMeetingWeekGroup(groupKey, { now });
}

/** Map calendar chrome view → side-panel schedule grouping. */
export function meetingScheduleGranularityFromViewMode(
  viewMode: CalendarViewMode,
): MeetingScheduleGroupGranularity {
  if (viewMode === "day") return "day";
  if (viewMode === "month") return "month";
  return "week";
}

function daysBetweenYmd(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aUtc = Date.UTC(ay!, am! - 1, ad!);
  const bUtc = Date.UTC(by!, bm! - 1, bd!);
  return Math.abs(Math.round((bUtc - aUtc) / 86_400_000));
}

/**
 * Pick the meeting on today, else the one closest to today (by local calendar
 * day, then by wall-clock distance). Used to land j/k and scroll anchors.
 */
export function findMeetingClosestToReference<
  T extends { id: string; startAt: number | Date | string | null },
>(meetings: readonly T[], options?: { now?: Date }): T | null {
  if (meetings.length === 0) return null;
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const todayYmd = formatLocalYmd(now);

  let best: T | null = null;
  let bestDayDelta = Infinity;
  let bestTimeDelta = Infinity;
  let bestIsFuture = false;

  for (const meeting of meetings) {
    if (meeting.startAt == null || meeting.startAt === "") continue;
    const start = new Date(meeting.startAt);
    if (Number.isNaN(start.getTime())) continue;
    const startYmd = formatLocalYmd(start);
    const dayDelta = daysBetweenYmd(todayYmd, startYmd);
    const timeDelta = Math.abs(start.getTime() - nowMs);
    const isFuture = start.getTime() >= nowMs;

    const betterDay = dayDelta < bestDayDelta;
    const sameDayCloserTime =
      dayDelta === bestDayDelta && timeDelta < bestTimeDelta;
    const sameDaySameTimePreferFuture =
      dayDelta === bestDayDelta &&
      timeDelta === bestTimeDelta &&
      isFuture &&
      !bestIsFuture;

    if (betterDay || sameDayCloserTime || sameDaySameTimePreferFuture) {
      best = meeting;
      bestDayDelta = dayDelta;
      bestTimeDelta = timeDelta;
      bestIsFuture = isFuture;
    }
  }

  return best;
}

function groupKeyForMeeting(
  startYmd: string,
  granularity: MeetingScheduleGroupGranularity,
): string {
  if (granularity === "day") return startYmd;
  if (granularity === "month") return startYmd.slice(0, 7);
  return startOfWeekYmd(startYmd);
}

/**
 * Group scheduled meetings by day / week / month (newest groups first).
 * Within each group, meetings are newest-first as well.
 */
export function groupScheduledMeetingsByPeriod<T extends MeetingListItem>(
  meetings: readonly T[],
  options: {
    granularity: MeetingScheduleGroupGranularity;
    now?: Date;
  },
): MeetingScheduleGroup<T>[] {
  const now = options.now ?? new Date();
  const sorted = sortMeetingsByStart([...meetings]);
  const groups = new Map<string, T[]>();
  const order: string[] = [];

  for (const meeting of sorted) {
    const groupKey = groupKeyForMeeting(
      meetingStartYmd(meeting.startAt ?? meeting.createdAt, now),
      options.granularity,
    );
    let bucket = groups.get(groupKey);
    if (!bucket) {
      bucket = [];
      groups.set(groupKey, bucket);
      order.push(groupKey);
    }
    bucket.push(meeting);
  }

  // Ascending discovery → reverse for newest week/day/month at the top.
  return order
    .slice()
    .reverse()
    .map((groupKey) => ({
      groupKey,
      label: meetingScheduleGroupLabel(groupKey, options.granularity, { now }),
      meetings: (groups.get(groupKey) ?? []).slice().reverse(),
    }));
}

/**
 * Group scheduled meetings into Monday-start weeks (newest weeks first).
 * Labels use ISO week numbers (`Week 38`).
 */
export function groupScheduledMeetingsByWeek<T extends MeetingListItem>(
  meetings: readonly T[],
  options?: { now?: Date },
): MeetingWeekGroup<T>[] {
  return groupScheduledMeetingsByPeriod(meetings, {
    granularity: "week",
    now: options?.now,
  }).map((group) => ({
    ...group,
    weekKey: group.groupKey,
  }));
}
