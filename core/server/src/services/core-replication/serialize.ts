const TIMESTAMP_SUFFIXES = [
  "_at",
  "_date",
] as const;

export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function isTimestampKey(key: string): boolean {
  return TIMESTAMP_SUFFIXES.some((suffix) => key.endsWith(suffix));
}

export function rowToReplicationPayload(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const snakeKey = camelToSnake(key);
    if (value instanceof Date) {
      payload[snakeKey] = value.toISOString();
    } else if (value === undefined) {
      continue;
    } else {
      payload[snakeKey] = value;
    }
  }
  return payload;
}

export function payloadToRowValues(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const camelKey = snakeToCamel(key);
    if (value == null) {
      row[camelKey] = null;
      continue;
    }
    if (typeof value === "string" && isTimestampKey(key)) {
      const date = new Date(value);
      row[camelKey] = Number.isNaN(date.getTime()) ? null : date;
      continue;
    }
    row[camelKey] = value;
  }
  return row;
}

export function readUpdatedAt(payload: Record<string, unknown>): Date {
  const raw = payload.updated_at ?? payload.updatedAt;
  if (raw instanceof Date) return raw;
  if (typeof raw === "string") {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date(0);
}
