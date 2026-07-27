import { useEffect, useState } from "react";

import { JournalWhoopHeaderSkeleton } from "@backsteros/ui";

import {
  fetchWhoopDaySnapshot,
  type WhoopSnapshotEntity,
} from "../lib/whoop";

const RING_CIRCUMFERENCE = 2 * Math.PI * 10;

const METRIC_MAX = {
  sleep: 100,
  recovery: 100,
  strain: 21,
} as const;

const METRIC_COLORS = {
  sleep: "#9D5AEF",
  recovery: "#5EC269",
  strain: "#4F81EE",
} as const;

function valueToDash(value: number | null | undefined, max: number): number {
  if (value == null || Number.isNaN(value) || value < 0) return 0;
  const clamped = Math.min(max, Math.max(0, value));
  return (clamped / max) * RING_CIRCUMFERENCE;
}

function formatValue(
  value: number | null | undefined,
  max: number,
  digits = 0,
): string {
  if (value == null || Number.isNaN(value) || value < 0 || value > max) {
    return "-";
  }
  if (digits > 0) return value.toFixed(digits);
  return Number.isInteger(value) ? String(value) : String(Math.round(value));
}

function WhoopMetricRing({
  label,
  value,
  max,
  color,
  digits = 0,
  loading,
  targetValue,
}: {
  label: string;
  value: number | null | undefined;
  max: number;
  color: string;
  digits?: number;
  loading: boolean;
  targetValue?: number | null;
}) {
  const dash = valueToDash(loading ? 0 : value, max);
  const targetDash = valueToDash(loading ? 0 : targetValue, max);
  const display = loading ? "\u00a0" : formatValue(value, max, digits);

  return (
    <div className="whoop-metric" title={`${label} ${display}`} style={{ color }}>
      <div className="whoop-metric-ring">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle
            className="whoop-metric-ring-track"
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          {targetDash > 0 ? (
            <circle
              className="whoop-metric-ring-target"
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={RING_CIRCUMFERENCE - targetDash}
            />
          ) : null}
          <circle
            className="whoop-metric-ring-value"
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={RING_CIRCUMFERENCE - dash}
          />
        </svg>
        <span className="whoop-metric-value">{display}</span>
      </div>
      <span className="whoop-metric-label">{label}</span>
    </div>
  );
}

function WhoopHeader({ snapshot }: { snapshot: WhoopSnapshotEntity }) {
  return (
    <div className="whoop-header">
      <WhoopMetricRing
        label="Sleep"
        value={snapshot.sleepPerformance}
        max={METRIC_MAX.sleep}
        color={METRIC_COLORS.sleep}
        loading={false}
      />
      <WhoopMetricRing
        label="Recovery"
        value={snapshot.recoveryScore}
        max={METRIC_MAX.recovery}
        color={METRIC_COLORS.recovery}
        loading={false}
      />
      <WhoopMetricRing
        label="Strain"
        value={snapshot.strainScore}
        max={METRIC_MAX.strain}
        color={METRIC_COLORS.strain}
        digits={1}
        loading={false}
        targetValue={snapshot.strainTarget?.value}
      />
    </div>
  );
}

/** Whoop rings; skeleton until this date's snapshot is ready. */
export function JournalWhoopLeading({
  dateSlug,
  fetchEnabled = true,
}: {
  dateSlug: string;
  /** When false, keep Whoop skeleton and do not fetch (wait for paint gate). */
  fetchEnabled?: boolean;
}) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<WhoopSnapshotEntity | null>(null);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState(dateSlug);

  // Same-render reset when the selected day changes — skeleton shows immediately.
  if (dateSlug !== activeSlug) {
    setActiveSlug(dateSlug);
    setAuthenticated(null);
    setSnapshot(null);
    setReadyFor(null);
  }

  useEffect(() => {
    if (!fetchEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchWhoopDaySnapshot(dateSlug);
        if (cancelled) return;
        setAuthenticated(result.authenticated);
        setSnapshot(result.snapshot);
        setReadyFor(dateSlug);
      } catch {
        if (cancelled) return;
        setAuthenticated(false);
        setSnapshot(null);
        setReadyFor(dateSlug);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateSlug, fetchEnabled]);

  if (authenticated === false && readyFor === dateSlug) {
    return null;
  }

  if (readyFor !== dateSlug) {
    return (
      <div
        className="journal-whoop-leading"
        aria-busy="true"
        aria-hidden="true"
      >
        <JournalWhoopHeaderSkeleton />
      </div>
    );
  }

  const display =
    snapshot ??
    ({
      id: `whoop-${dateSlug}`,
      date: dateSlug,
      sleepPerformance: null,
      recoveryScore: null,
      strainScore: null,
    } satisfies WhoopSnapshotEntity);

  return (
    <div className="journal-whoop-leading" aria-hidden="true">
      <WhoopHeader snapshot={display} />
    </div>
  );
}
