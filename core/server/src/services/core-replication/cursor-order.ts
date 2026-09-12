import type { ReplicationCursor } from "./types.js";

/**
 * Normalize a Postgres / JSON timestamptz string to UTC ISO with full
 * fractional seconds (up to microseconds). `Date#toISOString` only keeps
 * milliseconds — that collapses distinct PG timestamps and stalls
 * replication cursors when many rows share the same ms bucket.
 */
export function toIso(value: Date | string | null | undefined): string {
  if (!value) return "1970-01-01T00:00:00.000Z";
  if (value instanceof Date) return value.toISOString();

  const raw = String(value).trim();
  const withT = raw.includes("T") ? raw : raw.replace(" ", "T");
  const match = withT.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i,
  );
  if (!match) {
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return "1970-01-01T00:00:00.000Z";
    return new Date(parsed).toISOString();
  }

  const base = match[1]!;
  const frac = match[2] ?? "";
  const offset = (match[3] ?? "Z").toUpperCase();
  if (
    offset === "Z" ||
    offset === "+00" ||
    offset === "+00:00" ||
    offset === "+0000"
  ) {
    return `${base}${frac}Z`;
  }

  // Non-UTC offsets: convert via Date (ms) — rare for BacksterOS cores.
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return `${base}${frac}Z`;
  return new Date(parsed).toISOString();
}

/** Pad fractional seconds to 6 digits so string compare matches PG order. */
function sortableTime(iso: string): string {
  const match = iso.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?Z$/i,
  );
  if (!match) {
    const ms = Date.parse(iso);
    return Number.isNaN(ms)
      ? "1970-01-01T00:00:00.000000Z"
      : toIso(new Date(ms)).replace(
          /(\.\d{1,6})?Z$/,
          (_, f: string | undefined) =>
            `${(f ?? ".000").padEnd(7, "0").slice(0, 7)}Z`,
        );
  }
  const frac = (match[2] ?? ".000").padEnd(7, "0").slice(0, 7);
  return `${match[1]}${frac}Z`;
}

/** Compare replication watermarks: updatedAt then rowId. No DB dependency. */
export function compareCursor(
  a: ReplicationCursor,
  b: ReplicationCursor,
): number {
  const timeA = sortableTime(toIso(a.updatedAt));
  const timeB = sortableTime(toIso(b.updatedAt));
  if (timeA !== timeB) return timeA < timeB ? -1 : 1;
  return a.rowId.localeCompare(b.rowId);
}

export function maxCursor(
  current: ReplicationCursor,
  candidate: ReplicationCursor,
): ReplicationCursor {
  return compareCursor(candidate, current) > 0 ? candidate : current;
}
