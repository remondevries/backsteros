import * as chrono from "chrono-node";

import { formatTaskDueMetaLabel, parseYmdLocal } from "@/lib/task-due-date";

export type NaturalLanguageDueDateParseResult =
  | { kind: "date"; ymd: string; label: string }
  | { kind: "clear" }
  | { kind: "invalid" };

const CLEAR_DUE_DATE_PATTERN =
  /^(no due date|no date|clear( due date)?|remove( due date)?|unset|none)$/i;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

/** Parse free-text due date input (e.g. "next Friday", "in 2 weeks") into YYYY-MM-DD. */
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

  const parsed = chrono.en.casual.parseDate(trimmed, ref, { forwardDate: true });
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
