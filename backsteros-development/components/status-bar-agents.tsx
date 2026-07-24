"use client";

import type { AgentActivitySummary } from "@/lib/agent-activity";

export function StatusBarAgents({
  summary,
}: {
  summary: AgentActivitySummary;
}) {
  if (summary.total === 0) {
    return (
      <span className="statusbar-agents" title="No in-app agents detected">
        <span className="statusbar-metric-label">Agents</span>
        <span className="statusbar-metric-value">0</span>
        <span className="statusbar-agents-dot" aria-hidden="true" />
      </span>
    );
  }

  const parts: string[] = [];
  if (summary.working > 0) parts.push(`${summary.working} working`);
  if (summary.attention > 0) {
    parts.push(`${summary.attention} needs attention`);
  }
  if (summary.idle > 0) parts.push(`${summary.idle} idle`);
  if (summary.present > 0 && summary.working === 0 && summary.attention === 0) {
    parts.push(`${summary.present} open`);
  } else if (summary.present > 0) {
    parts.push(`${summary.present} open`);
  }

  const detail = parts.join(" · ");
  const title = [
    "In-app agents (from terminal sessions)",
    summary.working ? `${summary.working} working` : null,
    summary.attention ? `${summary.attention} needs attention` : null,
    summary.idle ? `${summary.idle} idle` : null,
    summary.present ? `${summary.present} open (status unknown)` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const dotClass =
    summary.working > 0
      ? "statusbar-agents-dot is-working"
      : summary.attention > 0
        ? "statusbar-agents-dot is-attention"
        : "statusbar-agents-dot";

  return (
    <span className="statusbar-agents" title={title}>
      <span className="statusbar-metric-label">Agents</span>
      <span className="statusbar-metric-value">
        {summary.total}
        {detail ? (
          <span className="statusbar-metric-pct"> · {detail}</span>
        ) : null}
      </span>
      <span className={dotClass} aria-hidden="true" />
    </span>
  );
}
