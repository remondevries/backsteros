/**
 * Compact +/- diff stats.
 * Adapted from pingdotgg/t3code (MIT) — apps/web/src/components/chat/DiffStatLabel.tsx
 */

function formatCompactDiffCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const k = value / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
  }
  if (value < 1_000_000_000) {
    const m = value / 1_000_000;
    return `${m < 10 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)}m`;
  }
  const b = value / 1_000_000_000;
  return `${b < 10 ? b.toFixed(1).replace(/\.0$/, "") : Math.round(b)}b`;
}

export function hasNonZeroStat(stat: {
  additions: number;
  deletions: number;
}): boolean {
  return stat.additions > 0 || stat.deletions > 0;
}

export function DiffStatLabel({
  additions,
  deletions,
  className = "",
  showParentheses = false,
  layout = "aligned",
}: {
  additions: number;
  deletions: number;
  className?: string;
  showParentheses?: boolean;
  layout?: "aligned" | "inline";
}) {
  return (
    <>
      {showParentheses ? (
        <span className="desktop-agent-chat__diff-stat-paren">(</span>
      ) : null}
      <span
        role="group"
        aria-label={`${additions} additions, ${deletions} deletions`}
        className={[
          "desktop-agent-chat__diff-stat-label",
          layout === "inline"
            ? "desktop-agent-chat__diff-stat-label--inline"
            : "desktop-agent-chat__diff-stat-label--aligned",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span
          aria-hidden
          className="desktop-agent-chat__diff-stat-label__add"
        >
          +{formatCompactDiffCount(additions)}
        </span>
        <span
          aria-hidden
          className="desktop-agent-chat__diff-stat-label__del"
        >
          -{formatCompactDiffCount(deletions)}
        </span>
      </span>
      {showParentheses ? (
        <span className="desktop-agent-chat__diff-stat-paren">)</span>
      ) : null}
    </>
  );
}
