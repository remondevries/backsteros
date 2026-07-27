import * as chrono from "chrono-node";

import { formatTaskDueMetaLabel, parseYmdLocal } from "@/lib/task-due-date";

export type NaturalLanguageDueDateParseResult =
  | { kind: "date"; ymd: string; label: string }
  | { kind: "clear" }
  | { kind: "invalid" };

const CLEAR_DUE_DATE_PATTERN =
  /^(no due date|no date|clear( due date)?|remove( due date)?|unset|none)$/i;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Minimum typed length before unique phrase prefixes auto-expand (e.g. "yest" → yesterday). */
const MIN_PHRASE_PREFIX_LENGTH = 3;

/**
 * Canonical phrases users often abbreviate. Unique prefixes expand before chrono.
 * Keep multi-word entries so "last w" → "last week" without waiting for the full word.
 */
const COMPLETABLE_DATE_PHRASES = [
  "yesterday",
  "tomorrow",
  "today",
  "last week",
  "next week",
  "last month",
  "next month",
  "one day ago",
  "two days ago",
  "three days ago",
  "four days ago",
  "five days ago",
  "six days ago",
  "one week ago",
  "two weeks ago",
  "three weeks ago",
  "2 days ago",
  "3 days ago",
  "4 days ago",
  "5 days ago",
  "6 days ago",
  "2 weeks ago",
  "3 weeks ago",
  "in 2 days",
  "in 3 days",
  "in 1 week",
  "in 2 weeks",
  "in one week",
  "in two weeks",
] as const;

const COMPLETABLE_CLEAR_PHRASES = [
  "no due date",
  "no date",
  "clear due date",
  "clear",
  "none",
  "unset",
  "remove due date",
  "remove",
] as const;

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
  next = next.replace(/^(an?\s+)?weeks?\s+ago$/i, "1 week ago");
  next = next.replace(/^(an?\s+)?days?\s+ago$/i, "1 day ago");
  return next.replace(/\s+/g, " ").trim();
}

function hasPastIntent(input: string): boolean {
  return PAST_INTENT_PATTERN.test(input);
}

function normalizeQuery(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Expand unique prefixes of known phrases so partial typing works
 * (e.g. "yest" → "yesterday", "tom" → "tomorrow").
 * Ambiguous prefixes (e.g. "last") are left unchanged.
 */
function expandCompletablePhrase(input: string): string {
  const needle = normalizeQuery(input);
  if (needle.length < MIN_PHRASE_PREFIX_LENGTH) {
    return input.trim();
  }

  const dateMatches = COMPLETABLE_DATE_PHRASES.filter((phrase) =>
    phrase.startsWith(needle),
  );
  if (dateMatches.length === 1) {
    return dateMatches[0]!;
  }

  return input.trim();
}

function matchesClearIntent(input: string): boolean {
  const needle = normalizeQuery(input);
  if (!needle) return false;
  if (CLEAR_DUE_DATE_PATTERN.test(needle)) return true;
  if (needle.length < MIN_PHRASE_PREFIX_LENGTH) return false;

  const clearMatches = COMPLETABLE_CLEAR_PHRASES.filter((phrase) =>
    phrase.startsWith(needle),
  );
  if (clearMatches.length === 0) return false;

  const dateMatches = COMPLETABLE_DATE_PHRASES.filter((phrase) =>
    phrase.startsWith(needle),
  );
  return dateMatches.length === 0;
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

/** Parse free-text due date input (e.g. "next Friday", "2 weeks ago", "yest") into YYYY-MM-DD. */
export function parseNaturalLanguageDueDate(
  input: string,
  ref: Date = new Date(),
): NaturalLanguageDueDateParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "invalid" };
  if (matchesClearIntent(trimmed)) {
    return { kind: "clear" };
  }
  if (ISO_DATE_PATTERN.test(trimmed)) {
    return resultForYmd(trimmed);
  }

  const expanded = expandCompletablePhrase(trimmed);
  if (matchesClearIntent(expanded)) {
    return { kind: "clear" };
  }

  const normalized = normalizePastDueDateInput(expanded);
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
