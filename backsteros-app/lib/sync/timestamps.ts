import { parseYmdLocal } from "@/lib/task-due-date";

function parseYmdOrTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseYmdLocal(trimmed);
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function toTimestampMs(value: unknown): number {
  if (value == null) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = parseYmdOrTimestamp(value);
    if (parsed) {
      return parsed.getTime();
    }
  }

  return Date.now();
}

export function toDate(value: unknown): Date | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value);
  }

  if (typeof value === "string") {
    return parseYmdOrTimestamp(value);
  }

  return null;
}
