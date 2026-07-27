/**
 * Minimal 5-field cron helpers (minute hour day-of-month month day-of-week).
 * Supports *, N, ranges, steps (star/N), and comma lists.
 * Day-of-week: 0-6 (Sun-Sat) or 7=Sun.
 */

const FIELD_BOUNDS = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 }, // day of week (7 ≡ Sunday)
] as const;

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!stepMatch) {
      throw new Error(`Invalid cron field: ${field}`);
    }
    const [, rangePart, stepRaw] = stepMatch;
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid cron step in field: ${field}`);
    }

    let start = min;
    let end = max;
    if (rangePart !== "*") {
      const [a, b] = rangePart!.split("-").map(Number);
      if (!Number.isInteger(a) || a < min || a > max) {
        throw new Error(`Invalid cron value in field: ${field}`);
      }
      start = a!;
      end = b === undefined ? a! : b;
      if (!Number.isInteger(end) || end < min || end > max || end < start) {
        throw new Error(`Invalid cron range in field: ${field}`);
      }
    }

    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }
  return values;
}

export function parseCronExpression(expression: string): [
  Set<number>,
  Set<number>,
  Set<number>,
  Set<number>,
  Set<number>,
] {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error("Cron expression must have 5 fields");
  }
  return FIELD_BOUNDS.map((bound, index) =>
    parseField(parts[index]!, bound.min, bound.max),
  ) as [
    Set<number>,
    Set<number>,
    Set<number>,
    Set<number>,
    Set<number>,
  ];
}

export function assertValidCronExpression(expression: string): string {
  parseCronExpression(expression);
  return expression.trim();
}

function dayOfWeekMatches(set: Set<number>, day: number): boolean {
  if (set.has(day)) return true;
  // 7 is Sunday alias
  if (day === 0 && set.has(7)) return true;
  return false;
}

function matches(
  date: Date,
  minute: Set<number>,
  hour: Set<number>,
  dayOfMonth: Set<number>,
  month: Set<number>,
  dayOfWeek: Set<number>,
): boolean {
  return (
    minute.has(date.getUTCMinutes()) &&
    hour.has(date.getUTCHours()) &&
    dayOfMonth.has(date.getUTCDate()) &&
    month.has(date.getUTCMonth() + 1) &&
    dayOfWeekMatches(dayOfWeek, date.getUTCDay())
  );
}

/** Next UTC instant strictly after `from` that matches the expression. */
export function getNextCronDate(expression: string, from: Date): Date {
  const [minute, hour, dayOfMonth, month, dayOfWeek] =
    parseCronExpression(expression);
  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  // Search up to ~2 years of minutes
  for (let i = 0; i < 60 * 24 * 366 * 2; i += 1) {
    if (matches(cursor, minute, hour, dayOfMonth, month, dayOfWeek)) {
      return new Date(cursor.getTime());
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  throw new Error(`No next run found for cron: ${expression}`);
}
