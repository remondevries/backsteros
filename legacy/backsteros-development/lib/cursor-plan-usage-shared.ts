/** Shared Cursor subscription usage types (safe for client + server). */

export type CursorPlanUsage = {
  autoPercentUsed: number;
  apiPercentUsed: number;
  totalPercentUsed: number;
  includedSpendCents: number | null;
  limitCents: number | null;
  remainingCents: number | null;
  displayMessage: string | null;
  billingCycleEndMs: number | null;
};

export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatPlanPercent(percent: number): string {
  if (percent >= 99.5) return "100%";
  if (percent < 1 && percent > 0) return "<1%";
  return `${Math.round(percent)}%`;
}

export function planUsageTone(
  percent: number,
): "ok" | "warn" | "critical" {
  if (percent >= 90) return "critical";
  if (percent >= 75) return "warn";
  return "ok";
}
