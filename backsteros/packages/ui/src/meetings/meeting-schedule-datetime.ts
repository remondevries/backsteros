import { formatLocalYmd, parseYmdLocal } from "../tasks/task-due-date.js";
import { DEFAULT_MEETING_DURATION_MINUTES } from "./parse-natural-language-meeting-schedule.js";

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function dayDelta(from: Date, to: Date): number {
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toDay.getTime() - fromDay.getTime()) / 86_400_000);
}

/** Local `HH:MM` for a `<input type="time">` value. */
export function formatLocalHm(date: Date | null | undefined): string {
  if (date == null || Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseLocalHm(
  hm: string,
): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return { hours, minutes };
}

export function withLocalHm(date: Date, hm: string): Date | null {
  const parsed = parseLocalHm(hm);
  if (!parsed || Number.isNaN(date.getTime())) return null;
  const next = new Date(date);
  next.setHours(parsed.hours, parsed.minutes, 0, 0);
  return next;
}

function defaultStartOnYmd(ymd: string): Date | null {
  const base = parseYmdLocal(ymd);
  if (!base) return null;
  base.setHours(9, 0, 0, 0);
  return base;
}

function resolvedDurationMinutes(startAt: Date, endAt: Date | null): number {
  if (
    endAt &&
    !Number.isNaN(endAt.getTime()) &&
    endAt.getTime() > startAt.getTime()
  ) {
    return Math.max(
      1,
      Math.round((endAt.getTime() - startAt.getTime()) / 60_000),
    );
  }
  return DEFAULT_MEETING_DURATION_MINUTES;
}

/**
 * Move the meeting onto `ymd` (start date), preserving clock times and the
 * start→end day span.
 */
export function applyMeetingScheduleDate(
  startAt: Date | null,
  endAt: Date | null,
  ymd: string,
): { startAt: Date; endAt: Date } | null {
  const previousStart =
    startAt && !Number.isNaN(startAt.getTime()) ? startAt : null;
  const nextStart = previousStart
    ? (() => {
        const base = parseYmdLocal(ymd);
        if (!base) return null;
        base.setHours(
          previousStart.getHours(),
          previousStart.getMinutes(),
          0,
          0,
        );
        return base;
      })()
    : defaultStartOnYmd(ymd);
  if (!nextStart) return null;

  const previousEnd =
    endAt && !Number.isNaN(endAt.getTime()) ? endAt : null;
  const duration = resolvedDurationMinutes(
    previousStart ?? nextStart,
    previousEnd,
  );

  if (previousStart && previousEnd) {
    const spanDays = dayDelta(previousStart, previousEnd);
    const nextEnd = new Date(nextStart);
    nextEnd.setDate(nextEnd.getDate() + spanDays);
    nextEnd.setHours(
      previousEnd.getHours(),
      previousEnd.getMinutes(),
      0,
      0,
    );
    if (nextEnd.getTime() <= nextStart.getTime()) {
      return { startAt: nextStart, endAt: addMinutes(nextStart, duration) };
    }
    return { startAt: nextStart, endAt: nextEnd };
  }

  return { startAt: nextStart, endAt: addMinutes(nextStart, duration) };
}

/** Update start clock time; keeps end after start using prior duration. */
export function applyMeetingStartTime(
  startAt: Date | null,
  endAt: Date | null,
  hm: string,
): { startAt: Date; endAt: Date } | null {
  const base =
    startAt && !Number.isNaN(startAt.getTime())
      ? startAt
      : defaultStartOnYmd(formatLocalYmd(new Date()));
  if (!base) return null;
  const nextStart = withLocalHm(base, hm);
  if (!nextStart) return null;
  const duration = resolvedDurationMinutes(base, endAt);
  const previousEnd =
    endAt && !Number.isNaN(endAt.getTime()) ? endAt : null;
  if (previousEnd && previousEnd.getTime() > nextStart.getTime()) {
    return { startAt: nextStart, endAt: previousEnd };
  }
  return { startAt: nextStart, endAt: addMinutes(nextStart, duration) };
}

/** Update end clock time; bumps to the next day when end ≤ start same day. */
export function applyMeetingEndTime(
  startAt: Date | null,
  endAt: Date | null,
  hm: string,
): { startAt: Date; endAt: Date } | null {
  const previousStart =
    startAt && !Number.isNaN(startAt.getTime()) ? startAt : null;
  const base =
    endAt && !Number.isNaN(endAt.getTime())
      ? endAt
      : previousStart
        ? addMinutes(previousStart, DEFAULT_MEETING_DURATION_MINUTES)
        : defaultStartOnYmd(formatLocalYmd(new Date()));
  if (!base) return null;

  const nextEnd = withLocalHm(base, hm);
  if (!nextEnd) return null;

  if (!previousStart) {
    const impliedStart = addMinutes(nextEnd, -DEFAULT_MEETING_DURATION_MINUTES);
    return { startAt: impliedStart, endAt: nextEnd };
  }

  if (nextEnd.getTime() <= previousStart.getTime()) {
    const bumped = new Date(nextEnd);
    bumped.setDate(bumped.getDate() + 1);
    if (bumped.getTime() <= previousStart.getTime()) {
      return {
        startAt: previousStart,
        endAt: addMinutes(previousStart, DEFAULT_MEETING_DURATION_MINUTES),
      };
    }
    return { startAt: previousStart, endAt: bumped };
  }

  return { startAt: previousStart, endAt: nextEnd };
}
