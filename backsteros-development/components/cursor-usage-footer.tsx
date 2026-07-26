"use client";

import { formatTokenCount } from "@/lib/agent-turn";
import {
  formatPlanPercent,
  planUsageTone,
} from "@/lib/cursor-plan-usage-shared";
import { useCursorApiUsage } from "@/lib/use-cursor-api-usage";
import { useCursorPlanUsage } from "@/lib/use-cursor-plan-usage";

function UsageBar({
  label,
  percent,
}: {
  label: string;
  percent: number;
}) {
  const tone = planUsageTone(percent);
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="console-cursor-usage-bar-row">
      <div className="console-cursor-usage-bar-head">
        <span>{label}</span>
        <span className="console-cursor-usage-bar-pct">
          {formatPlanPercent(clamped)}
        </span>
      </div>
      <div
        className="console-cursor-usage-bar-track"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
      >
        <div
          className={`console-cursor-usage-bar-fill console-cursor-usage-bar-fill--${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Cursor subscription usage footer for the projects rail — Auto / API
 * progress toward the included plan allowance.
 */
export function CursorUsageFooter({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const { usage, loading, error } = useCursorPlanUsage();
  const consoleUsage = useCursorApiUsage();
  const consoleTokens = formatTokenCount(consoleUsage.totalTokens);

  if (collapsed) {
    const pct = usage ? Math.round(usage.totalPercentUsed) : null;
    const title = usage
      ? `Cursor plan ${formatPlanPercent(usage.totalPercentUsed)} used` +
        ` · Auto ${formatPlanPercent(usage.autoPercentUsed)}` +
        ` · API ${formatPlanPercent(usage.apiPercentUsed)}`
      : loading
        ? "Loading Cursor plan usage…"
        : "Cursor plan usage unavailable";
    return (
      <div
        className="console-cursor-usage console-cursor-usage--collapsed"
        title={title}
        aria-label={title}
      >
        <span className="console-cursor-usage-compact">
          {pct != null ? `${pct}%` : "—"}
        </span>
        {usage ? (
          <div
            className="console-cursor-usage-bar-track console-cursor-usage-bar-track--compact"
            role="progressbar"
            aria-hidden
          >
            <div
              className={`console-cursor-usage-bar-fill console-cursor-usage-bar-fill--${planUsageTone(usage.totalPercentUsed)}`}
              style={{ width: `${Math.min(100, usage.totalPercentUsed)}%` }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="console-cursor-usage" aria-busy={loading}>
        <div className="console-cursor-usage-value">
          <span className="console-cursor-usage-meta">
            {loading
              ? "Loading plan…"
              : error
                ? "Plan usage unavailable"
                : "Sign in to Cursor on this machine"}
          </span>
        </div>
        {consoleUsage.turnCount > 0 ? (
          <div className="console-cursor-usage-console-meta">
            Console · {consoleTokens} tokens
          </div>
        ) : null}
      </div>
    );
  }

  const title =
    [
      `Auto ${formatPlanPercent(usage.autoPercentUsed)}`,
      `API ${formatPlanPercent(usage.apiPercentUsed)}`,
      consoleUsage.turnCount > 0
        ? `This console ${consoleTokens} tokens`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Cursor plan usage";

  return (
    <div className="console-cursor-usage" title={title} aria-label={title}>
      <UsageBar label="Auto" percent={usage.autoPercentUsed} />
      <UsageBar label="API" percent={usage.apiPercentUsed} />
    </div>
  );
}
