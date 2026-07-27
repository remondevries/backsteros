"use client";

import { useEffect, useState } from "react";

import { WhoopMetricRing } from "@/components/whoop/whoop-metric-ring";
import {
  WHOOP_METRIC_COLORS,
  WHOOP_METRIC_MAX,
  formatWhoopRingValue,
} from "@/lib/whoop/metrics";
import type { WhoopSnapshotEntity } from "@/lib/whoop/types";

const WHOOP_HEADER_ANIMATION_MS = 460;
const WHOOP_EMPTY_DISPLAY = "-";

function formatAnimatedMetricValue(
  value: number | null,
  max: number,
  digits = 0,
): string {
  if (value == null || Number.isNaN(value)) {
    return "";
  }
  const clamped = Math.max(0, Math.min(max, value));
  if (digits > 0) {
    return clamped.toFixed(digits);
  }
  return String(Math.round(clamped));
}

function useAnimatedMetricValue(
  value: number | null | undefined,
  animationKey: string,
): { value: number | null; visible: boolean } {
  const [animatedValue, setAnimatedValue] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  const animationSyncKey = `${animationKey}|${value ?? "null"}`;
  const [prevAnimationSyncKey, setPrevAnimationSyncKey] = useState(animationSyncKey);
  if (animationSyncKey !== prevAnimationSyncKey) {
    setPrevAnimationSyncKey(animationSyncKey);
    if (value == null || !Number.isFinite(value)) {
      setAnimatedValue(null);
      setVisible(false);
    } else {
      // Start empty so the ring fills up when data arrives.
      setAnimatedValue(0);
      setVisible(false);
    }
  }

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) {
      return;
    }

    let startTime: number | null = null;
    let frameId = 0;
    const durationMs = WHOOP_HEADER_ANIMATION_MS;
    const target = Math.max(0, value);

    const step = (timestamp: number) => {
      if (startTime == null) {
        startTime = timestamp;
      }
      const progress = Math.min(1, (timestamp - startTime) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setAnimatedValue(target * eased);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
        return;
      }

      setAnimatedValue(target);
    };

    frameId = window.requestAnimationFrame((timestamp) => {
      setVisible(true);
      step(timestamp);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [animationSyncKey, value]);

  return { value: animatedValue, visible };
}

function metricDisplayValue({
  loading,
  sourceValue,
  animatedValue,
  max,
  digits = 0,
}: {
  loading: boolean;
  sourceValue: number | null | undefined;
  animatedValue: number | null;
  max: number;
  digits?: number;
}): { text: string; visible: boolean } {
  if (loading) {
    return { text: "\u00a0", visible: false };
  }

  if (sourceValue == null || !Number.isFinite(sourceValue)) {
    return { text: WHOOP_EMPTY_DISPLAY, visible: true };
  }

  return {
    text: formatAnimatedMetricValue(animatedValue, max, digits),
    visible: animatedValue != null,
  };
}

type JournalWhoopHeaderProps = {
  snapshot: WhoopSnapshotEntity;
  /** Empty rings with a soft pulse while the day snapshot is fetching. */
  loading?: boolean;
};

export function JournalWhoopHeaderSkeleton() {
  return (
    <JournalWhoopHeader
      snapshot={{
        id: "whoop-loading",
        date: "",
        sleepPerformance: null,
        recoveryScore: null,
        strainScore: null,
      }}
      loading
    />
  );
}

export function JournalWhoopHeader({
  snapshot,
  loading = false,
}: JournalWhoopHeaderProps) {
  const animationKey = snapshot.id || snapshot.date;
  const sleep = useAnimatedMetricValue(
    snapshot.sleepPerformance,
    `${animationKey}:sleep`,
  );
  const recovery = useAnimatedMetricValue(
    snapshot.recoveryScore,
    `${animationKey}:recovery`,
  );
  const strain = useAnimatedMetricValue(
    snapshot.strainScore,
    `${animationKey}:strain`,
  );

  const sleepDisplay = metricDisplayValue({
    loading,
    sourceValue: snapshot.sleepPerformance,
    animatedValue: sleep.value,
    max: WHOOP_METRIC_MAX.sleep,
  });
  const recoveryDisplay = metricDisplayValue({
    loading,
    sourceValue: snapshot.recoveryScore,
    animatedValue: recovery.value,
    max: WHOOP_METRIC_MAX.recovery,
  });
  const strainDisplay = metricDisplayValue({
    loading,
    sourceValue: snapshot.strainScore,
    animatedValue: strain.value,
    max: WHOOP_METRIC_MAX.strain,
    digits: 1,
  });

  return (
    <div
      className="flex w-full justify-center"
      aria-busy={loading || undefined}
      aria-label={loading ? "Loading Whoop" : undefined}
    >
      <div className="flex items-start justify-center gap-6">
        <WhoopMetricRing
          label="Sleep"
          value={sleep.value}
          max={WHOOP_METRIC_MAX.sleep}
          ringColor={WHOOP_METRIC_COLORS.sleep}
          animateFill={false}
          displayValue={sleepDisplay.text}
          valueClassName={!sleepDisplay.visible ? "opacity-0" : undefined}
          className={loading ? "whoop-metric-ring--loading" : undefined}
          title={
            snapshot.sleepPerformance != null
              ? `Sleep ${formatWhoopRingValue(snapshot.sleepPerformance, WHOOP_METRIC_MAX.sleep)}`
              : loading
                ? undefined
                : "Sleep — no data"
          }
        />
        <WhoopMetricRing
          label="Recovery"
          value={recovery.value}
          max={WHOOP_METRIC_MAX.recovery}
          ringColor={WHOOP_METRIC_COLORS.recovery}
          animateFill={false}
          displayValue={recoveryDisplay.text}
          valueClassName={!recoveryDisplay.visible ? "opacity-0" : undefined}
          className={loading ? "whoop-metric-ring--loading" : undefined}
          title={
            snapshot.recoveryScore != null
              ? `Recovery ${formatWhoopRingValue(snapshot.recoveryScore, WHOOP_METRIC_MAX.recovery)}`
              : loading
                ? undefined
                : "Recovery — no data"
          }
        />
        <WhoopMetricRing
          label="Strain"
          value={strain.value}
          targetValue={loading ? null : snapshot.strainTarget?.value}
          max={WHOOP_METRIC_MAX.strain}
          ringColor={WHOOP_METRIC_COLORS.strain}
          animateFill={false}
          displayValue={strainDisplay.text}
          valueClassName={!strainDisplay.visible ? "opacity-0" : undefined}
          className={loading ? "whoop-metric-ring--loading" : undefined}
          title={
            snapshot.strainScore != null
              ? `Strain ${formatWhoopRingValue(snapshot.strainScore, WHOOP_METRIC_MAX.strain, 1)}`
              : loading
                ? undefined
                : "Strain — no data"
          }
        />
      </div>
    </div>
  );
}
