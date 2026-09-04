import type { WhoopDayResult, WhoopSnapshot } from "@backsteros/contracts";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors } from "../lib/theme";
import { useMobileApiClient } from "../lib/use-mobile-api-client";

/** Journal detail rings — large enough for two-digit / strain values. */
const RING_SIZE = 58;
/** Desktop geometry: r=10 in a 24 viewBox → keep the same fill ratio. */
const RING_RADIUS_RATIO = 10 / 24;

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

const WHOOP_DAY_CACHE_TTL_MS = 120_000;
const whoopDayCache = new Map<
  string,
  { writtenAt: number; result: WhoopDayResult }
>();

function peekWhoopDayCache(date: string): WhoopDayResult | null {
  const entry = whoopDayCache.get(date);
  if (!entry || Date.now() - entry.writtenAt >= WHOOP_DAY_CACHE_TTL_MS) {
    whoopDayCache.delete(date);
    return null;
  }
  return entry.result;
}

function writeWhoopDayCache(date: string, result: WhoopDayResult): void {
  if (!result.authenticated || !result.snapshot) {
    whoopDayCache.delete(date);
    return;
  }
  whoopDayCache.set(date, { writtenAt: Date.now(), result });
}

export type WhoopDayViewState = {
  authenticated: boolean | null;
  snapshot: WhoopSnapshot | null;
  ready: boolean;
};

function initialStateForDate(dateSlug: string): WhoopDayViewState {
  const cached = peekWhoopDayCache(dateSlug);
  if (!cached) {
    return { authenticated: null, snapshot: null, ready: false };
  }
  return {
    authenticated: cached.authenticated,
    snapshot: cached.snapshot,
    ready: true,
  };
}

/** Owns Whoop fetch/cache for a journal day — keep this hook above view/edit swaps. */
export function useWhoopDaySnapshot(dateSlug: string): WhoopDayViewState {
  const client = useMobileApiClient();
  const [state, setState] = useState<WhoopDayViewState>(() =>
    initialStateForDate(dateSlug),
  );
  const [activeSlug, setActiveSlug] = useState(dateSlug);

  if (dateSlug !== activeSlug) {
    setActiveSlug(dateSlug);
    setState(initialStateForDate(dateSlug));
  }

  useEffect(() => {
    const cached = peekWhoopDayCache(dateSlug);
    if (cached?.authenticated && cached.snapshot) {
      setState({
        authenticated: cached.authenticated,
        snapshot: cached.snapshot,
        ready: true,
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const result = await client.requestJson<WhoopDayResult>(
          `/api/v1/whoop/day?date=${encodeURIComponent(dateSlug)}`,
        );
        if (cancelled) return;
        writeWhoopDayCache(dateSlug, result);
        setState({
          authenticated: result.authenticated,
          snapshot: result.snapshot,
          ready: true,
        });
      } catch {
        if (cancelled) return;
        setState({
          authenticated: false,
          snapshot: null,
          ready: true,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, dateSlug]);

  return state;
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
  size = RING_SIZE,
  showLabel = true,
}: {
  label: string;
  value: number | null | undefined;
  max: number;
  color: string;
  digits?: number;
  loading: boolean;
  targetValue?: number | null;
  size?: number;
  showLabel?: boolean;
}) {
  const scale = size / RING_SIZE;
  const radius = size * RING_RADIUS_RATIO;
  const circumference = 2 * Math.PI * radius;
  const stroke = Math.max(2.5, 3 * scale);
  const center = size / 2;
  const dash =
    value == null || Number.isNaN(value) || value < 0
      ? 0
      : (Math.min(max, Math.max(0, value)) / max) * circumference;
  const targetDash =
    targetValue == null || Number.isNaN(targetValue) || targetValue < 0
      ? 0
      : (Math.min(max, Math.max(0, targetValue)) / max) * circumference;
  const display = loading ? " " : formatValue(value, max, digits);
  const valueFont = Math.max(10, Math.round(14 * scale));

  return (
    <View
      accessible
      accessibilityLabel={`${label} ${display}`}
      style={{
        alignItems: "center",
        width: showLabel ? Math.max(72, size + 14) : size + 4,
        gap: 4,
      }}
    >
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            opacity={0.18}
          />
          {targetDash > 0 ? (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference - targetDash}
              opacity={0.35}
              rotation={-90}
              origin={`${center}, ${center}`}
            />
          ) : null}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference - dash}
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        </Svg>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color,
              fontSize: valueFont,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
            }}
          >
            {display}
          </Text>
        </View>
      </View>
      {showLabel ? (
        <Text
          style={{
            color: colors.muted,
            fontSize: 11,
            fontWeight: "600",
            letterSpacing: 0.2,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}

function WhoopHeaderSkeleton() {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        gap: 24,
        paddingTop: 4,
        paddingBottom: 4,
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 1, 2].map((key) => (
        <View
          key={key}
          style={{
            alignItems: "center",
            width: Math.max(72, RING_SIZE + 14),
            gap: 4,
          }}
        >
          <View
            style={{
              width: RING_SIZE,
              height: RING_SIZE,
              borderRadius: RING_SIZE / 2,
              backgroundColor: colors.faint,
            }}
          />
          <View
            style={{
              width: 36,
              height: 10,
              borderRadius: 4,
              backgroundColor: colors.faint,
            }}
          />
        </View>
      ))}
    </View>
  );
}

function WhoopHeader({
  snapshot,
  compact = false,
}: {
  snapshot: WhoopSnapshot;
  compact?: boolean;
}) {
  const ringSize = compact ? 34 : RING_SIZE;
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: compact ? "flex-end" : "center",
        alignItems: "center",
        gap: compact ? 8 : 24,
        paddingTop: compact ? 0 : 4,
        paddingBottom: compact ? 0 : 4,
      }}
    >
      <WhoopMetricRing
        label="Sleep"
        value={snapshot.sleepPerformance}
        max={METRIC_MAX.sleep}
        color={METRIC_COLORS.sleep}
        loading={false}
        size={ringSize}
        showLabel={!compact}
      />
      <WhoopMetricRing
        label="Recovery"
        value={snapshot.recoveryScore}
        max={METRIC_MAX.recovery}
        color={METRIC_COLORS.recovery}
        loading={false}
        size={ringSize}
        showLabel={!compact}
      />
      <WhoopMetricRing
        label="Strain"
        value={snapshot.strainScore}
        max={METRIC_MAX.strain}
        color={METRIC_COLORS.strain}
        digits={1}
        loading={false}
        targetValue={snapshot.strainTarget?.value}
        size={ringSize}
        showLabel={!compact}
      />
    </View>
  );
}

/** Presentational Whoop rings — pass state from `useWhoopDaySnapshot`. */
export function JournalWhoopLeading({
  dateSlug,
  state,
}: {
  dateSlug: string;
  state: WhoopDayViewState;
}) {
  if (state.ready && state.authenticated === false) {
    return null;
  }

  if (!state.ready) {
    return <WhoopHeaderSkeleton />;
  }

  const display =
    state.snapshot ??
    ({
      id: `whoop-${dateSlug}`,
      date: dateSlug,
      sleepPerformance: null,
      recoveryScore: null,
      strainScore: null,
    } satisfies WhoopSnapshot);

  return <WhoopHeader snapshot={display} />;
}

const LIST_RING_SIZE = 34;

function WhoopListSkeleton() {
  return (
    <View
      style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 1, 2].map((key) => (
        <View
          key={key}
          style={{
            width: LIST_RING_SIZE,
            height: LIST_RING_SIZE,
            borderRadius: LIST_RING_SIZE / 2,
            backgroundColor: colors.faint,
          }}
        />
      ))}
    </View>
  );
}

/**
 * Compact sleep / recovery / strain rings for journal list rows (iPhone).
 * Fetches via shared day cache — safe to mount per visible row.
 */
export function JournalWhoopListTrailing({ dateSlug }: { dateSlug: string }) {
  const state = useWhoopDaySnapshot(dateSlug);

  if (state.ready && state.authenticated === false) {
    return null;
  }

  if (!state.ready) {
    return <WhoopListSkeleton />;
  }

  const display =
    state.snapshot ??
    ({
      id: `whoop-${dateSlug}`,
      date: dateSlug,
      sleepPerformance: null,
      recoveryScore: null,
      strainScore: null,
    } satisfies WhoopSnapshot);

  return <WhoopHeader snapshot={display} compact />;
}
