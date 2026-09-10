import { useEffect } from "react";

import {
  cursorUsageTitle,
  formatDaysUntilReset,
  formatPlanPercent,
  formatUsdCents,
  planUsageTone,
} from "~/backsteros/cursorUsage";
import { useCursorUsageStore } from "~/backsteros/cursorUsageStore";
import { cn } from "../../lib/utils";

function UsageBar({ label, percent }: { label: string; percent: number }) {
  const tone = planUsageTone(percent);
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-sidebar-foreground/60">
        <span>{label}</span>
        <span className="shrink-0 tabular-nums">{formatPlanPercent(clamped)}</span>
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-sidebar-foreground/10"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
      >
        <div
          className={cn(
            "h-full min-w-0 rounded-full transition-[width] duration-200",
            tone === "critical"
              ? "bg-[#c45c5c]/80"
              : tone === "warn"
                ? "bg-[#c4922a]/75"
                : "bg-[#3d9a6a]/70",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function CursorCreditsBody({
  usage,
  loading,
}: {
  usage: ReturnType<typeof useCursorUsageStore.getState>["usage"];
  loading: boolean;
}) {
  if (!usage?.available) {
    return (
      <div
        className="px-2.5 py-1.5 text-[11px] leading-snug text-sidebar-muted-foreground"
        aria-busy={loading}
      >
        {loading ? "Loading plan…" : usage?.error?.trim() || "Sign in to Cursor on this machine"}
      </div>
    );
  }

  const remainingLabel =
    usage.remainingCents != null && usage.limitCents != null && usage.limitCents > 0
      ? `${formatUsdCents(usage.remainingCents)} left`
      : null;
  const resetDaysLabel = formatDaysUntilReset(usage.billingCycleEndMs);

  return (
    <div
      className="flex flex-col gap-2 px-2.5 py-1.5 text-[11px] text-sidebar-foreground/70"
      title={cursorUsageTitle(usage)}
      aria-label={cursorUsageTitle(usage)}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="inline-flex min-w-0 items-baseline gap-1">
          <span className="font-medium tracking-wide text-sidebar-foreground/55">Cursor</span>
          {resetDaysLabel ? (
            <span className="tabular-nums text-sidebar-foreground/45">({resetDaysLabel})</span>
          ) : null}
        </span>
        {remainingLabel ? (
          <span className="shrink-0 tabular-nums text-sidebar-foreground/75">{remainingLabel}</span>
        ) : null}
      </div>
      <UsageBar label="Auto" percent={usage.autoPercentUsed} />
      <UsageBar label="API" percent={usage.apiPercentUsed} />
      {usage.grokBotPercentUsed != null ? (
        <UsageBar label="Grok Bot" percent={usage.grokBotPercentUsed} />
      ) : null}
    </div>
  );
}

/**
 * Sidebar footer: Cursor monthly included Auto / API usage toward the plan
 * allowance, plus weekly Grok Bot quota when the account includes it.
 * Usage is shared across Code/Servers sidebar remounts to avoid flicker.
 */
export function SidebarCursorCreditsUsageBar() {
  const usage = useCursorUsageStore((state) => state.usage);
  const loading = useCursorUsageStore((state) => state.loading);

  useEffect(() => useCursorUsageStore.getState().subscribe(), []);

  return <CursorCreditsBody usage={usage} loading={loading} />;
}
