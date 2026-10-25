/** Parse a latitude / longitude that may arrive as a number or numeric string. */
export function asCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Stable key for a coordinate pair (≈1 m precision), e.g. for tile caches. */
export function coordinatesKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

/** True when both pairs are set and within ~1 m of each other. */
export function sameCoordinates(
  a: { latitude?: unknown; longitude?: unknown } | null | undefined,
  b: { latitude: number; longitude: number },
): boolean {
  const latitude = asCoord(a?.latitude);
  const longitude = asCoord(a?.longitude);
  return (
    latitude != null &&
    longitude != null &&
    Math.abs(latitude - b.latitude) < 1e-5 &&
    Math.abs(longitude - b.longitude) < 1e-5
  );
}
