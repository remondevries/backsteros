import * as chrono from "chrono-node";

import { formatCalendarTaskScheduleLabel } from "../calendar/calendar-events.js";

export const DEFAULT_MEETING_DURATION_MINUTES = 60;

export type NaturalLanguageMeetingScheduleParseResult =
  | { kind: "range"; startAt: Date; endAt: Date; label: string }
  | { kind: "clear" }
  | { kind: "invalid" };

const CLEAR_SCHEDULE_PATTERN =
  /^(no (time|schedule|date)|clear( schedule)?|remove( schedule)?|unset|none)$/i;

const DURATION_PATTERN =
  /\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function parseDurationMinutes(text: string): number | null {
  const match = DURATION_PATTERN.exec(text);
  if (!match) return null;

  const amount = Number.parseFloat(match[1]!);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2]!.toLowerCase();
  if (unit.startsWith("h")) {
    return Math.round(amount * 60);
  }
  return Math.round(amount);
}

function isDurationOnlyFragment(text: string): boolean {
  return /^\s*for\s+\d/i.test(text.trim());
}

function pickPrimaryParseResult(
  results: chrono.ParsedResult[],
): chrono.ParsedResult | null {
  const withRange = results.find((result) => result.end != null);
  if (withRange) return withRange;

  const candidates = results.filter((result) => !isDurationOnlyFragment(result.text));
  if (candidates.length === 0) return results[0] ?? null;

  return candidates.sort(
    (left, right) =>
      right.start.date().getTime() - left.start.date().getTime(),
  )[0]!;
}

function buildRangeResult(
  startAt: Date,
  endAt: Date,
  fallbackLabel: string,
): NaturalLanguageMeetingScheduleParseResult {
  if (endAt.getTime() <= startAt.getTime()) {
    return { kind: "invalid" };
  }

  return {
    kind: "range",
    startAt,
    endAt,
    label: formatCalendarTaskScheduleLabel(startAt, endAt) ?? fallbackLabel,
  };
}

/** Parse free-text meeting schedule input into a start/end datetime range. */
export function parseNaturalLanguageMeetingSchedule(
  input: string,
  ref: Date = new Date(),
  defaultDurationMinutes = DEFAULT_MEETING_DURATION_MINUTES,
): NaturalLanguageMeetingScheduleParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "invalid" };
  if (CLEAR_SCHEDULE_PATTERN.test(trimmed)) {
    return { kind: "clear" };
  }

  const durationMinutes = parseDurationMinutes(trimmed);
  const results = chrono.en.casual.parse(trimmed, ref, { forwardDate: true });
  if (results.length === 0) {
    return { kind: "invalid" };
  }

  const primary = pickPrimaryParseResult(results);
  if (!primary) {
    return { kind: "invalid" };
  }

  const startAt = primary.start.date();
  if (Number.isNaN(startAt.getTime())) {
    return { kind: "invalid" };
  }

  let endAt = primary.end?.date() ?? null;
  if (!endAt || Number.isNaN(endAt.getTime())) {
    const minutes = durationMinutes ?? defaultDurationMinutes;
    endAt = addMinutes(startAt, minutes);
  }

  return buildRangeResult(startAt, endAt, trimmed);
}

/** Short preview label for the dropdown while the user types. */
export function naturalLanguageMeetingSchedulePreview(
  input: string,
  ref: Date = new Date(),
): string | null {
  const result = parseNaturalLanguageMeetingSchedule(input, ref);
  if (result.kind === "clear") return "Clear schedule";
  if (result.kind === "range") return `Set to ${result.label}`;
  return null;
}
