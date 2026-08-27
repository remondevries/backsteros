/** Local calendar-day helpers shared by desktop and mobile clients. */

export function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseYmdLocal(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

/** One formatter per IANA timezone — constructing Intl.DateTimeFormat is expensive. */
const ymdFormattersByTimeZone = new Map<string, Intl.DateTimeFormat>();

function getYmdFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = ymdFormattersByTimeZone.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    ymdFormattersByTimeZone.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Calendar day for a due value.
 * Pass workspace `timeZone` for journal/desktop parity (UTC-offset due timestamps).
 */
export function getTaskDueDateYmd(
  dueDate: Date | number | string | null | undefined,
  timeZone?: string,
): string | null {
  if (dueDate == null) return null;
  if (typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
    return dueDate.trim();
  }
  const date =
    dueDate instanceof Date
      ? dueDate
      : typeof dueDate === "number"
        ? new Date(dueDate)
        : new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  if (timeZone) {
    try {
      const parts = getYmdFormatter(timeZone).formatToParts(date);
      const year = parts.find((part) => part.type === "year")?.value;
      const month = parts.find((part) => part.type === "month")?.value;
      const day = parts.find((part) => part.type === "day")?.value;
      if (year && month && day) return `${year}-${month}-${day}`;
    } catch {
      // Invalid stored timezone: fall back to the machine calendar.
    }
  }
  return formatLocalYmd(date);
}
