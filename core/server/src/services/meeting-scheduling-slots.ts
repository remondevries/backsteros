import type {
  MeetingSchedulingSettings,
  MeetingSlot,
} from "@backsteros/contracts";

import {
  getWeekdayHoursEntry,
  normalizeWeekdayHours,
  parseTimeToMinutes,
} from "./meeting-scheduling-weekday-hours.js";

export type TimeInterval = { startMs: number; endMs: number };

export { parseTimeToMinutes } from "./meeting-scheduling-weekday-hours.js";

/** ISO weekday in timezone: 1 = Monday … 7 = Sunday. */
export function isoWeekdayInTimeZone(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[weekday] ?? 1;
}

export function ymdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** Convert a local wall-clock time in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(
  ymd: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;

  let utcMs = Date.UTC(y, m - 1, d, hour, minute);
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      })
        .formatToParts(new Date(utcMs))
        .map((part) => [part.type, part.value]),
    );
    const zy = Number(parts.year);
    const zm = Number(parts.month);
    const zd = Number(parts.day);
    let zh = Number(parts.hour);
    if (zh === 24) zh = 0;
    const zn = Number(parts.minute);
    const desired = Date.UTC(y, m - 1, d, hour, minute);
    const actual = Date.UTC(zy, zm - 1, zd, zh, zn);
    const diff = desired - actual;
    if (diff === 0) return new Date(utcMs);
    utcMs += diff;
  }
  return new Date(utcMs);
}

export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function expandInterval(
  interval: TimeInterval,
  bufferMinutes: number,
): TimeInterval {
  const pad = bufferMinutes * 60_000;
  return {
    startMs: interval.startMs - pad,
    endMs: interval.endMs + pad,
  };
}

export function generateSlotsForRange(input: {
  settings: MeetingSchedulingSettings;
  from: Date;
  to: Date;
  durationMinutes: 30 | 60;
  busyIntervals: TimeInterval[];
  now?: Date;
}): MeetingSlot[] {
  const {
    settings,
    from,
    to,
    durationMinutes,
    busyIntervals,
    now = new Date(),
  } = input;
  const weekdayHours = normalizeWeekdayHours(settings.weekdayHours);
  const minStartMs = now.getTime() + settings.minNoticeMinutes * 60_000;
  const bufferedBusy = busyIntervals.map((interval) =>
    expandInterval(interval, settings.bufferMinutes),
  );

  const slots: MeetingSlot[] = [];
  const rangeStartMs = from.getTime();
  const rangeEndMs = to.getTime();
  const stepMs = durationMinutes * 60_000;

  let cursor = new Date(from);
  while (cursor.getTime() <= rangeEndMs) {
    const ymd = ymdInTimeZone(cursor, settings.timezone);
    const probe = zonedLocalToUtc(ymd, 12, 0, settings.timezone);
    if (!probe) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60_000);
      continue;
    }
    const weekday = isoWeekdayInTimeZone(probe, settings.timezone);
    const dayHours = getWeekdayHoursEntry(weekdayHours, weekday);
    if (!dayHours?.enabled) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60_000);
      continue;
    }
    for (const window of dayHours.slots) {
      const startMinutes = parseTimeToMinutes(window.start);
      const endMinutes = parseTimeToMinutes(window.end);
      if (startMinutes == null || endMinutes == null) continue;
      if (endMinutes <= startMinutes) continue;
      for (
        let minute = startMinutes;
        minute + durationMinutes <= endMinutes;
        minute += durationMinutes
      ) {
        const hour = Math.floor(minute / 60);
        const min = minute % 60;
        const slotStart = zonedLocalToUtc(ymd, hour, min, settings.timezone);
        if (!slotStart) continue;
        const slotEnd = new Date(slotStart.getTime() + stepMs);
        const startMs = slotStart.getTime();
        const endMs = slotEnd.getTime();
        if (startMs < rangeStartMs || endMs > rangeEndMs) continue;
        if (startMs < minStartMs) continue;

        const blocked = bufferedBusy.some((busy) =>
          intervalsOverlap(startMs, endMs, busy.startMs, busy.endMs),
        );
        if (!blocked) {
          slots.push({
            startAt: slotStart.toISOString(),
            endAt: slotEnd.toISOString(),
            durationMinutes,
          });
        }
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000);
  }

  return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
}
