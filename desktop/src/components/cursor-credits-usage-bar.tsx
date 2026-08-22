import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  cursorUsageTitle,
  formatDaysUntilReset,
  formatPlanPercent,
  formatUsdCents,
  planUsageTone,
  type CursorUsage,
} from "../lib/cursor-usage";

const POLL_MS = 5 * 60 * 1000;

function UsageBar({ label, percent }: { label: string; percent: number }) {
  const tone = planUsageTone(percent);
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="sidebar-cursor-credits-bar-row">
      <div className="sidebar-cursor-credits-bar-head">
        <span>{label}</span>
        <span className="sidebar-cursor-credits-bar-pct">
          {formatPlanPercent(clamped)}
        </span>
      </div>
      <div
        className="sidebar-cursor-credits-track"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
      >
        <div
          className={`sidebar-cursor-credits-fill sidebar-cursor-credits-fill--${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Sidebar footer: Cursor monthly included Auto / API usage toward the plan
 * allowance, plus weekly Grok Bot quota when the account includes it.
 */
export function CursorCreditsUsageBar() {
  const [usage, setUsage] = useState<CursorUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await invoke<CursorUsage>("cursor_usage");
        if (!cancelled) {
          setUsage(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setUsage({
            available: false,
            autoPercentUsed: 0,
            apiPercentUsed: 0,
            totalPercentUsed: 0,
            error: "Cursor credits unavailable",
            sampledAt: Date.now(),
          });
          setLoading(false);
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!usage?.available) {
    return (
      <div className="sidebar-cursor-credits" aria-busy={loading}>
        <div className="sidebar-cursor-credits-meta">
          {loading
            ? "Loading plan…"
            : usage?.error?.trim() || "Sign in to Cursor on this machine"}
        </div>
      </div>
    );
  }

  const remainingLabel =
    usage.remainingCents != null &&
    usage.limitCents != null &&
    usage.limitCents > 0
      ? `${formatUsdCents(usage.remainingCents)} left`
      : null;
  const resetDaysLabel = formatDaysUntilReset(usage.billingCycleEndMs);

  return (
    <div
      className="sidebar-cursor-credits"
      title={cursorUsageTitle(usage)}
      aria-label={cursorUsageTitle(usage)}
    >
      <div className="sidebar-cursor-credits-row">
        <span className="sidebar-cursor-credits-label-group">
          <span className="sidebar-cursor-credits-label">Cursor</span>
          {resetDaysLabel ? (
            <span className="sidebar-cursor-credits-reset">
              ({resetDaysLabel})
            </span>
          ) : null}
        </span>
        {remainingLabel ? (
          <span className="sidebar-cursor-credits-value">{remainingLabel}</span>
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
