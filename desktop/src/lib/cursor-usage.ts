/** Shared Cursor subscription usage helpers (sidebar credits bar). */

export type CursorUsage = {
  available: boolean;
  autoPercentUsed: number;
  apiPercentUsed: number;
  totalPercentUsed: number;
  includedSpendCents?: number | null;
  limitCents?: number | null;
  remainingCents?: number | null;
  displayMessage?: string | null;
  billingCycleEndMs?: number | null;
  grokBotPercentUsed?: number | null;
  grokBotResetMs?: number | null;
  error?: string | null;
  sampledAt: number;
};

export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
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

export function planUsageTone(percent: number): "ok" | "warn" | "critical" {
  if (percent >= 90) return "critical";
  if (percent >= 75) return "warn";
  return "ok";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days until the billing cycle resets (ceil partial days). */
export function daysUntilReset(
  billingCycleEndMs: number | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (billingCycleEndMs == null || !Number.isFinite(billingCycleEndMs)) {
    return null;
  }
  const msLeft = billingCycleEndMs - nowMs;
  if (msLeft <= 0) return 0;
  return Math.ceil(msLeft / MS_PER_DAY);
}

export function formatDaysUntilReset(
  billingCycleEndMs: number | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  const days = daysUntilReset(billingCycleEndMs, nowMs);
  if (days == null) return null;
  return `${days}d`;
}

export function cursorUsageTitle(usage: CursorUsage | null): string {
  if (!usage) return "Cursor credits";
  if (!usage.available) {
    return usage.error?.trim() || "Cursor credits unavailable";
  }
  const parts = [
    `Auto ${formatPlanPercent(usage.autoPercentUsed)}`,
    `API ${formatPlanPercent(usage.apiPercentUsed)}`,
  ];
  if (usage.grokBotPercentUsed != null) {
    parts.push(`Grok Bot ${formatPlanPercent(usage.grokBotPercentUsed)}`);
  }
  if (
    usage.remainingCents != null &&
    usage.limitCents != null &&
    usage.limitCents > 0
  ) {
    parts.push(
      `${formatUsdCents(usage.remainingCents)} of ${formatUsdCents(usage.limitCents)} left`,
    );
  }
  if (usage.displayMessage?.trim()) {
    parts.push(usage.displayMessage.trim());
  }
  if (usage.billingCycleEndMs != null) {
    const end = new Date(usage.billingCycleEndMs);
    if (!Number.isNaN(end.getTime())) {
      parts.push(
        `Resets ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      );
    }
  }
  if (usage.grokBotResetMs != null) {
    const end = new Date(usage.grokBotResetMs);
    if (!Number.isNaN(end.getTime())) {
      parts.push(
        `Grok Bot resets ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      );
    }
  }
  return parts.join(" · ");
}
