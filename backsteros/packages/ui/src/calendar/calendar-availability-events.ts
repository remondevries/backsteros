import type {
  MeetingWeekdayHoursEntry,
  MeetingWeekdayHoursSlot,
} from "@backsteros/contracts";

import { formatWeekdaySlotsLabel } from "./calendar-availability-slots.js";

export const AVAILABILITY_EVENT_TYPE = "availability";
export const MEETINGS_AVAILABILITY_MARKER_TYPE = "meetings_availability_marker";

export type AvailabilityCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  editable: boolean;
  allDay?: boolean;
  display?: "auto" | "block";
  extendedProps: {
    entityType: typeof AVAILABILITY_EVENT_TYPE;
    weekday: number;
    ymd: string;
    slotIndex: number;
  };
};

export const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday - 1] ?? `Day ${weekday}`;
}

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

function parseTimeToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export function formatTimeInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function getWeekdayEntry(
  weekdayHours: MeetingWeekdayHoursEntry[],
  weekday: number,
): MeetingWeekdayHoursEntry | null {
  return weekdayHours.find((entry) => entry.weekday === weekday) ?? null;
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function weekdayFromYmd(ymd: string, timezone: string): number {
  const probe = zonedLocalToUtc(ymd, 12, 0, timezone);
  return probe ? isoWeekdayInTimeZone(probe, timezone) : 1;
}

export function getWeekdayHoursForYmd(
  weekdayHours: MeetingWeekdayHoursEntry[],
  ymd: string,
  timezone: string,
): MeetingWeekdayHoursEntry | null {
  return getWeekdayEntry(weekdayHours, weekdayFromYmd(ymd, timezone));
}

export function weekdayHoursToCalendarEvents(input: {
  weekdayHours: MeetingWeekdayHoursEntry[];
  timezone: string;
  rangeStart: Date;
  rangeEnd: Date;
  editable?: boolean;
  presentation?: "timed" | "month";
}): AvailabilityCalendarEvent[] {
  const {
    weekdayHours,
    timezone,
    rangeStart,
    rangeEnd,
    editable = true,
    presentation = "timed",
  } = input;
  const events: AvailabilityCalendarEvent[] = [];
  const cursor = new Date(rangeStart);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() < rangeEnd.getTime()) {
    const ymd = ymdInTimeZone(cursor, timezone);
    const probe = zonedLocalToUtc(ymd, 12, 0, timezone);
    if (probe) {
      const weekday = isoWeekdayInTimeZone(probe, timezone);
      const dayHours = getWeekdayEntry(weekdayHours, weekday);
      if (dayHours?.enabled) {
        dayHours.slots.forEach((slot, slotIndex) => {
          const startMinutes = parseTimeToMinutes(slot.start);
          const endMinutes = parseTimeToMinutes(slot.end);
          if (
            startMinutes == null ||
            endMinutes == null ||
            endMinutes <= startMinutes
          ) {
            return;
          }
          if (presentation === "month" && slotIndex > 0) return;
          const start = zonedLocalToUtc(
            ymd,
            Math.floor(startMinutes / 60),
            startMinutes % 60,
            timezone,
          );
          const end = zonedLocalToUtc(
            ymd,
            Math.floor(endMinutes / 60),
            endMinutes % 60,
            timezone,
          );
          if (!start || !end) return;
          if (presentation === "month") {
            events.push({
              id: `availability-${ymd}`,
              title: formatWeekdaySlotsLabel(dayHours),
              start: ymd,
              end: addDaysToYmd(ymd, 1),
              allDay: true,
              display: "block",
              editable: false,
              extendedProps: {
                entityType: AVAILABILITY_EVENT_TYPE,
                weekday,
                ymd,
                slotIndex: 0,
              },
            });
            return;
          }
          events.push({
            id: `availability-${ymd}-${slotIndex}`,
            title: "Available",
            start: start.toISOString(),
            end: end.toISOString(),
            editable,
            extendedProps: {
              entityType: AVAILABILITY_EVENT_TYPE,
              weekday,
              ymd,
              slotIndex,
            },
          });
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return events;
}

export type MeetingsAvailabilityMarkerEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  display: "background";
  backgroundColor: "transparent";
  borderColor: "transparent";
  editable: false;
  classNames: ["calendar-meetings-availability-marker"];
  extendedProps: {
    entityType: typeof MEETINGS_AVAILABILITY_MARKER_TYPE;
    weekday: number;
    ymd: string;
    slotIndex: number;
  };
};

export function isMeetingsAvailabilityGridView(viewType: string): boolean {
  return viewType === "timeGridWeek" || viewType === "timeGridDay";
}

/** Background markers for the meetings calendar (week/day) — thin left-edge booking windows. */
export function weekdayHoursToMeetingAvailabilityMarkers(input: {
  weekdayHours: MeetingWeekdayHoursEntry[];
  timezone: string;
  rangeStart: Date;
  rangeEnd: Date;
}): MeetingsAvailabilityMarkerEvent[] {
  const { weekdayHours, timezone, rangeStart, rangeEnd } = input;
  const events: MeetingsAvailabilityMarkerEvent[] = [];
  const cursor = new Date(rangeStart);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() < rangeEnd.getTime()) {
    const ymd = ymdInTimeZone(cursor, timezone);
    const probe = zonedLocalToUtc(ymd, 12, 0, timezone);
    if (probe) {
      const weekday = isoWeekdayInTimeZone(probe, timezone);
      const dayHours = getWeekdayEntry(weekdayHours, weekday);
      if (dayHours?.enabled) {
        dayHours.slots.forEach((slot, slotIndex) => {
          const startMinutes = parseTimeToMinutes(slot.start);
          const endMinutes = parseTimeToMinutes(slot.end);
          if (
            startMinutes == null ||
            endMinutes == null ||
            endMinutes <= startMinutes
          ) {
            return;
          }
          const start = zonedLocalToUtc(
            ymd,
            Math.floor(startMinutes / 60),
            startMinutes % 60,
            timezone,
          );
          const end = zonedLocalToUtc(
            ymd,
            Math.floor(endMinutes / 60),
            endMinutes % 60,
            timezone,
          );
          if (!start || !end) return;
          events.push({
            id: `meetings-availability-${ymd}-${slotIndex}`,
            title: "",
            start: start.toISOString(),
            end: end.toISOString(),
            display: "background",
            backgroundColor: "transparent",
            borderColor: "transparent",
            editable: false,
            classNames: ["calendar-meetings-availability-marker"],
            extendedProps: {
              entityType: MEETINGS_AVAILABILITY_MARKER_TYPE,
              weekday,
              ymd,
              slotIndex,
            },
          });
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return events;
}

export const MAX_WEEKDAY_SLOTS_PER_DAY = 8;

export function calendarChangeToWeekdayHoursPatch(input: {
  weekday: number;
  slotIndex?: number;
  start: Date | null;
  end: Date | null;
  timezone: string;
  weekdayHours: MeetingWeekdayHoursEntry[];
}): MeetingWeekdayHoursEntry[] | null {
  const { weekday, slotIndex = 0, start, end, timezone, weekdayHours } = input;
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  const startTime = formatTimeInTimeZone(start, timezone);
  const endTime = formatTimeInTimeZone(end, timezone);
  if (
    parseTimeToMinutes(startTime) == null ||
    parseTimeToMinutes(endTime) == null
  ) {
    return null;
  }
  return weekdayHours.map((entry) => {
    if (entry.weekday !== weekday) return entry;
    const slots = entry.slots.map((slot, index) =>
      index === slotIndex ? { start: startTime, end: endTime } : slot,
    );
    return { ...entry, enabled: true, slots };
  });
}

export function calendarSelectionToWeekdayHoursPatch(input: {
  start: Date;
  end: Date;
  timezone: string;
  weekdayHours: MeetingWeekdayHoursEntry[];
}): MeetingWeekdayHoursEntry[] | null {
  const { start, end, timezone, weekdayHours } = input;
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  const startTime = formatTimeInTimeZone(start, timezone);
  const endTime = formatTimeInTimeZone(end, timezone);
  if (
    parseTimeToMinutes(startTime) == null ||
    parseTimeToMinutes(endTime) == null
  ) {
    return null;
  }
  const weekday = isoWeekdayInTimeZone(start, timezone);
  const newSlot: MeetingWeekdayHoursSlot = { start: startTime, end: endTime };
  let rejected = false;

  const patched = weekdayHours.map((entry) => {
    if (entry.weekday !== weekday) return entry;
    if (!entry.enabled) {
      return { ...entry, enabled: true, slots: [newSlot] };
    }
    if (entry.slots.length >= MAX_WEEKDAY_SLOTS_PER_DAY) {
      rejected = true;
      return entry;
    }
    return { ...entry, enabled: true, slots: [...entry.slots, newSlot] };
  });

  if (rejected) return null;
  return patched;
}
