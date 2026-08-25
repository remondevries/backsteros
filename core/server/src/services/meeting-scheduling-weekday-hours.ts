import type {
  MeetingWeekdayHoursEntry,
  MeetingWeekdayHoursSlot,
} from "@backsteros/contracts";

import type { MeetingWorkingHours } from "../db/schema.js";

export const DEFAULT_WEEKDAY_SLOT: MeetingWeekdayHoursSlot = {
  start: "09:00",
  end: "17:00",
};

export const DEFAULT_WEEKDAY_HOURS: MeetingWeekdayHoursEntry[] = [
  { weekday: 1, enabled: true, slots: [{ ...DEFAULT_WEEKDAY_SLOT }] },
  { weekday: 2, enabled: true, slots: [{ ...DEFAULT_WEEKDAY_SLOT }] },
  { weekday: 3, enabled: true, slots: [{ ...DEFAULT_WEEKDAY_SLOT }] },
  { weekday: 4, enabled: true, slots: [{ ...DEFAULT_WEEKDAY_SLOT }] },
  { weekday: 5, enabled: true, slots: [{ ...DEFAULT_WEEKDAY_SLOT }] },
  { weekday: 6, enabled: false, slots: [{ ...DEFAULT_WEEKDAY_SLOT }] },
  { weekday: 7, enabled: false, slots: [{ ...DEFAULT_WEEKDAY_SLOT }] },
];

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

export function parseTimeToMinutes(value: string): number | null {
  const match = value.trim().match(TIME_RE);
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

function normalizeSlot(raw: unknown): MeetingWeekdayHoursSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const start = String((raw as MeetingWeekdayHoursSlot).start ?? "");
  const end = String((raw as MeetingWeekdayHoursSlot).end ?? "");
  if (parseTimeToMinutes(start) == null || parseTimeToMinutes(end) == null) {
    return null;
  }
  if (parseTimeToMinutes(end)! <= parseTimeToMinutes(start)!) return null;
  return { start, end };
}

function normalizeSlots(raw: unknown, fallbackStart?: string, fallbackEnd?: string): MeetingWeekdayHoursSlot[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const slots = raw
      .map((slot) => normalizeSlot(slot))
      .filter((slot): slot is MeetingWeekdayHoursSlot => slot != null);
    if (slots.length > 0) return slots;
  }
  const start = fallbackStart ?? DEFAULT_WEEKDAY_SLOT.start;
  const end = fallbackEnd ?? DEFAULT_WEEKDAY_SLOT.end;
  const legacy = normalizeSlot({ start, end });
  return legacy ? [legacy] : [{ ...DEFAULT_WEEKDAY_SLOT }];
}

export function normalizeWeekdayHoursEntry(
  raw: unknown,
  fallbackWeekday: number,
): MeetingWeekdayHoursEntry {
  if (!raw || typeof raw !== "object") {
    return (
      DEFAULT_WEEKDAY_HOURS.find((entry) => entry.weekday === fallbackWeekday) ?? {
        weekday: fallbackWeekday,
        enabled: false,
        slots: [{ ...DEFAULT_WEEKDAY_SLOT }],
      }
    );
  }
  const weekday = Number((raw as MeetingWeekdayHoursEntry).weekday);
  const enabled = Boolean((raw as MeetingWeekdayHoursEntry).enabled);
  const legacyStart = String((raw as { start?: string }).start ?? "");
  const legacyEnd = String((raw as { end?: string }).end ?? "");
  const slots = normalizeSlots(
    (raw as MeetingWeekdayHoursEntry).slots,
    legacyStart || undefined,
    legacyEnd || undefined,
  );
  return {
    weekday: weekday >= 1 && weekday <= 7 ? weekday : fallbackWeekday,
    enabled,
    slots,
  };
}

export function normalizeWeekdayHours(
  input: unknown,
  legacy?: MeetingWorkingHours | null,
): MeetingWeekdayHoursEntry[] {
  if (Array.isArray(input) && input.length > 0) {
    const byWeekday = new Map<number, MeetingWeekdayHoursEntry>();
    for (const entry of input) {
      const normalized = normalizeWeekdayHoursEntry(entry, 0);
      if (normalized.weekday >= 1 && normalized.weekday <= 7) {
        byWeekday.set(normalized.weekday, normalized);
      }
    }
    return DEFAULT_WEEKDAY_HOURS.map(
      (fallback) => byWeekday.get(fallback.weekday) ?? { ...fallback },
    );
  }
  return legacyWorkingHoursToWeekdayHours(legacy);
}

export function legacyWorkingHoursToWeekdayHours(
  legacy?: MeetingWorkingHours | null,
): MeetingWeekdayHoursEntry[] {
  const weekdays = new Set(
    (legacy?.weekdays ?? [1, 2, 3, 4, 5]).filter((day) => day >= 1 && day <= 7),
  );
  const slot = normalizeSlots(null, legacy?.start, legacy?.end)[0]!;
  return DEFAULT_WEEKDAY_HOURS.map((entry) => ({
    weekday: entry.weekday,
    enabled: weekdays.has(entry.weekday),
    slots: [{ ...slot }],
  }));
}

export function getWeekdayHoursEntry(
  weekdayHours: MeetingWeekdayHoursEntry[],
  weekday: number,
): MeetingWeekdayHoursEntry | null {
  return weekdayHours.find((entry) => entry.weekday === weekday) ?? null;
}

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

export function formatWeekdaySlotsLabel(
  entry: MeetingWeekdayHoursEntry,
): string {
  return entry.slots
    .map((slot) => `${slot.start} – ${slot.end}`)
    .join(", ");
}
