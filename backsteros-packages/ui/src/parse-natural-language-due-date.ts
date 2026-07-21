import * as chrono from "chrono-node";

import { formatTaskDueMetaLabel, parseYmdLocal } from "./task-due-date.js";

export type NaturalLanguageDueDateParseResult =
  | { kind: "date"; ymd: string; label: string }
  | { kind: "clear" }
  | { kind: "invalid" };

const CLEAR_DUE_DATE_PATTERN =
  /^(no due date|no date|clear( due date)?|remove( due date)?|unset|none)$/i;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Phrases that should resolve to the past (disable chrono `forwardDate`). */
const PAST_INTENT_PATTERN =
  /\b(ago|yesterday|yesterdays|previous|overdue)\b|\bin the past\b|\blast\b/i;

/**
 * Normalize casual past phrasing chrono mishandles (esp. with `forwardDate`).
 * e.g. "two weeks in the past" → "two weeks ago", "week ago" → "1 week ago".
 */
function normalizePastDueDateInput(input: string): string {
  let next = input.trim();
  next = next.replace(/\bin the past\b/gi, "ago");
  next = next.replace(/\bprevious\b/gi, "last");
  // Bare quantity-less relatives
  next = next.replace(/^(an?\s+)?weeks?\s+ago$/i, "1 week ago");
  next = next.replace(/^(an?\s+)?days?\s+ago$/i, "1 day ago");
  return next.replace(/\s+/g, " ").trim();
}

function hasPastIntent(input: string): boolean {
  return PAST_INTENT_PATTERN.test(input);
}

function dateToLocalYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resultForYmd(ymd: string): NaturalLanguageDueDateParseResult {
  const parsed = parseYmdLocal(ymd);
  if (!parsed) {
    return { kind: "invalid" };
  }

  return {
    kind: "date",
    ymd,
    label: formatTaskDueMetaLabel(parsed) ?? ymd,
  };
}

/** Parse free-text due date input (e.g. "next Friday", "2 weeks ago") into YYYY-MM-DD. */
export function parseNaturalLanguageDueDate(
  input: string,
  ref: Date = new Date(),
): NaturalLanguageDueDateParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "invalid" };
  if (CLEAR_DUE_DATE_PATTERN.test(trimmed)) {
    return { kind: "clear" };
  }
  if (ISO_DATE_PATTERN.test(trimmed)) {
    return resultForYmd(trimmed);
  }

  const normalized = normalizePastDueDateInput(trimmed);
  const forwardDate = !hasPastIntent(normalized) && !hasPastIntent(trimmed);
  const parsed = chrono.en.casual.parseDate(normalized, ref, { forwardDate });
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return { kind: "invalid" };
  }

  return resultForYmd(dateToLocalYmd(parsed));
}

/** Short preview label for the dropdown while the user types. */
export function naturalLanguageDueDatePreview(
  input: string,
  ref: Date = new Date(),
): string | null {
  const result = parseNaturalLanguageDueDate(input, ref);
  if (result.kind === "clear") return "Clear due date";
  if (result.kind === "date") return `Set to ${result.label}`;
  return null;
}
