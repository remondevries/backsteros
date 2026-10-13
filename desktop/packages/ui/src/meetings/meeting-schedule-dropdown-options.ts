import type { SearchableDropdownOption } from "../components/dropdowns/searchable-dropdown.js";
import { searchableDropdownShortcut } from "../dropdowns/searchable-dropdown-shortcuts.js";
import { formatCalendarTaskScheduleLabel } from "../calendar/calendar-events.js";
import { DEFAULT_MEETING_DURATION_MINUTES } from "./parse-natural-language-meeting-schedule.js";

export const MEETING_NO_SCHEDULE_VALUE = "__no_meeting_schedule__";
export const MEETING_PICK_SCHEDULE_VALUE = "__pick_meeting_schedule__";

const RANGE_VALUE_PREFIX = "__meeting_range__:";

function addLocalDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function roundToNextQuarterHour(date: Date): Date {
  const stepMs = 15 * 60_000;
  return new Date(Math.ceil(date.getTime() / stepMs) * stepMs);
}

function atLocalTime(base: Date, hours: number, minutes = 0): Date {
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function nextWeekday(base: Date, weekday: number): Date {
  const next = new Date(base);
  const delta = (weekday + 7 - next.getDay()) % 7 || 7;
  next.setDate(next.getDate() + delta);
  return next;
}

export function meetingScheduleRangeValue(startAt: Date, endAt: Date): string {
  return `${RANGE_VALUE_PREFIX}${startAt.getTime()}:${endAt.getTime()}`;
}

export function meetingScheduleRangeFromDropdownValue(
  value: string,
): { startAt: Date; endAt: Date } | null {
  if (!value.startsWith(RANGE_VALUE_PREFIX)) return null;
  const payload = value.slice(RANGE_VALUE_PREFIX.length);
  const [startMs, endMs] = payload.split(":");
  const startAt = new Date(Number(startMs));
  const endAt = new Date(Number(endMs));
  if (
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    endAt.getTime() <= startAt.getTime()
  ) {
    return null;
  }
  return { startAt, endAt };
}

export function isPickMeetingScheduleValue(value: string): boolean {
  return value === MEETING_PICK_SCHEDULE_VALUE;
}

export function isClearMeetingScheduleValue(value: string): boolean {
  return value === MEETING_NO_SCHEDULE_VALUE;
}

type PresetRange = {
  startAt: Date;
  endAt: Date;
  label: string;
  searchTerms: string;
};

function buildPresetRanges(now = new Date()): PresetRange[] {
  const inOneHourStart = roundToNextQuarterHour(addMinutes(now, 60));
  const tomorrow = addLocalDays(now, 1);
  const nextMonday = nextWeekday(now, 1);

  return [
    {
      startAt: inOneHourStart,
      endAt: addMinutes(inOneHourStart, DEFAULT_MEETING_DURATION_MINUTES),
      label: "In 1 hour",
      searchTerms: "soon later in one hour",
    },
    {
      startAt: atLocalTime(tomorrow, 9),
      endAt: atLocalTime(tomorrow, 10),
      label: "Tomorrow 9–10am",
      searchTerms: "tomorrow morning 9am",
    },
    {
      startAt: atLocalTime(tomorrow, 14),
      endAt: atLocalTime(tomorrow, 15),
      label: "Tomorrow 2–3pm",
      searchTerms: "tomorrow afternoon 2pm 14:00",
    },
    {
      startAt: atLocalTime(nextMonday, 9),
      endAt: atLocalTime(nextMonday, 10),
      label: "Next Monday 9–10am",
      searchTerms: "monday morning next week",
    },
  ];
}

export function meetingScheduleDropdownValue(
  startAt: Date | null,
  endAt: Date | null,
  options: SearchableDropdownOption[],
): string {
  if (!startAt || Number.isNaN(startAt.getTime())) {
    return MEETING_NO_SCHEDULE_VALUE;
  }

  const resolvedEnd =
    endAt && !Number.isNaN(endAt.getTime()) && endAt.getTime() > startAt.getTime()
      ? endAt
      : addMinutes(startAt, DEFAULT_MEETING_DURATION_MINUTES);
  const currentValue = meetingScheduleRangeValue(startAt, resolvedEnd);
  if (options.some((option) => option.value === currentValue)) {
    return currentValue;
  }
  return currentValue;
}

export function buildMeetingScheduleDropdownOptions(
  startAt: Date | null,
  endAt: Date | null,
  now = new Date(),
  options?: { allowClear?: boolean },
): SearchableDropdownOption[] {
  const allowClear = options?.allowClear !== false;
  const presetEntries = buildPresetRanges(now).map((preset) => ({
    value: meetingScheduleRangeValue(preset.startAt, preset.endAt),
    label: preset.label,
    searchTerms: preset.searchTerms,
  }));

  const current =
    startAt && !Number.isNaN(startAt.getTime())
      ? {
          startAt,
          endAt:
            endAt &&
            !Number.isNaN(endAt.getTime()) &&
            endAt.getTime() > startAt.getTime()
              ? endAt
              : addMinutes(startAt, DEFAULT_MEETING_DURATION_MINUTES),
        }
      : null;

  if (current) {
    const currentValue = meetingScheduleRangeValue(
      current.startAt,
      current.endAt,
    );
    if (!presetEntries.some((entry) => entry.value === currentValue)) {
      presetEntries.unshift({
        value: currentValue,
        label:
          formatCalendarTaskScheduleLabel(current.startAt, current.endAt) ??
          "Current schedule",
        searchTerms: "current",
      });
    }
  }

  const result: SearchableDropdownOption[] = presetEntries.map(
    (entry, index) => ({
      ...entry,
      shortcut: searchableDropdownShortcut(index),
    }),
  );

  result.push({
    value: MEETING_PICK_SCHEDULE_VALUE,
    label: "Pick times…",
    shortcut: searchableDropdownShortcut(result.length),
    searchTerms: "custom manual calendar datetime pick choose",
  });

  if (allowClear) {
    result.push({
      value: MEETING_NO_SCHEDULE_VALUE,
      label: "Clear schedule",
      shortcut: searchableDropdownShortcut(result.length),
      searchTerms: "none clear remove unset",
    });
  }

  return result;
}
