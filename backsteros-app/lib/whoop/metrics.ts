export const WHOOP_METRIC_MAX = {
  sleep: 100,
  recovery: 100,
  strain: 21,
} as const;

export type WhoopMetricKey = keyof typeof WHOOP_METRIC_MAX;

export const WHOOP_METRIC_COLORS: Record<WhoopMetricKey, string> = {
  sleep: "#9D5AEF",
  recovery: "#5EC269",
  strain: "#4F81EE",
};

export const WHOOP_METRIC_RING_CIRCUMFERENCE = 2 * Math.PI * 10;

export function whoopValueToDash(value: number | null | undefined, max: number): number {
  if (value == null || Number.isNaN(value) || value < 0) {
    return 0;
  }
  const clamped = Math.min(max, Math.max(0, value));
  return (clamped / max) * WHOOP_METRIC_RING_CIRCUMFERENCE;
}

export function formatWhoopRingValue(
  value: number | null | undefined,
  max: number,
  digits = 0,
): string {
  if (value == null || Number.isNaN(value) || value < 0 || value > max) {
    return "—";
  }
  if (digits > 0) {
    return value.toFixed(digits);
  }
  return Number.isInteger(value) ? String(value) : String(Math.round(value));
}
