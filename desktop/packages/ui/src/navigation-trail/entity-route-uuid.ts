/** UUID v1–v5 shape historically used in trail identity payloads. */
export const ENTITY_ROUTE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Default nanoid length/alphabet used by API `newId()`. */
export const ENTITY_ROUTE_NANOID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

/** True when `value` is a stable entity id (UUID or nanoid) in a trail payload. */
export function isEntityRouteId(value: string): boolean {
  const trimmed = value.trim();
  return (
    ENTITY_ROUTE_UUID_PATTERN.test(trimmed) ||
    ENTITY_ROUTE_NANOID_PATTERN.test(trimmed)
  );
}

/** @deprecated Prefer `isEntityRouteId` — accepts UUID and nanoid. */
export function isEntityRouteUuid(value: string): boolean {
  return isEntityRouteId(value);
}
