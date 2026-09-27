/**
 * Bind helpers for generic replication upserts.
 *
 * postgres.js cannot bind plain JS arrays/objects as unsafe query params, so
 * they travel as JSON text. jsonb columns cast with `::jsonb`; Postgres array
 * columns (e.g. text[]) must be rebuilt from that JSON — casting jsonb straight
 * into text[] fails ("column is of type text[] but expression is of type jsonb").
 */

const SAFE_PG_TYPE_NAME = /^[a-z_][a-z0-9_]*$/;

export function isJsonBindValue(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value)
  );
}

export function serializeBindValue(value: unknown): unknown {
  if (isJsonBindValue(value)) {
    return JSON.stringify(value);
  }
  return value;
}

/**
 * Element type for an array column from information_schema `udt_name`
 * (`_text` → `text`). Returns null for non-array or unexpected names.
 */
export function arrayElementTypeFromUdtName(udtName: string): string | null {
  if (!udtName.startsWith("_")) return null;
  const element = udtName.slice(1);
  return SAFE_PG_TYPE_NAME.test(element) ? element : null;
}

/** SQL placeholder for one bound column value (1-based `position`). */
export function buildBindPlaceholder(
  position: number,
  value: unknown,
  arrayElementType: string | null | undefined,
): string {
  if (
    Array.isArray(value) &&
    arrayElementType &&
    SAFE_PG_TYPE_NAME.test(arrayElementType)
  ) {
    return `ARRAY(SELECT jsonb_array_elements_text($${position}::jsonb))::${arrayElementType}[]`;
  }
  if (isJsonBindValue(value)) {
    return `$${position}::jsonb`;
  }
  return `$${position}`;
}
