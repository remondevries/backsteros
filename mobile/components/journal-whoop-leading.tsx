import type { WhoopDayResult, WhoopSnapshot } from "@backsteros/contracts";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors } from "../lib/theme";
import { useMobileApiClient } from "../lib/use-mobile-api-client";

const RING_SIZE = 44;
const RING_RADIUS = 10;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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
  const display = loading ? " " : formatValue(value, max, digits);

  return (
    <View
      accessible
      accessibilityLabel={`${label} ${display}`}
      style={{ alignItems: "center", width: 64, gap: 4 }}
    >
      <View style={{ width: RING_SIZE, height: RING_SIZE }}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 24 24">
          <Circle
            cx="12"
            cy="12"
            r={RING_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={3}
            opacity={0.18}
          />
          {targetDash > 0 ? (
            <Circle
              cx="12"
              cy="12"
              r={RING_RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={RING_CIRCUMFERENCE - targetDash}
              opacity={0.35}
              rotation={-90}
              origin="12, 12"
            />
          ) : null}
          <Circle
            cx="12"
            cy="12"
            r={RING_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={RING_CIRCUMFERENCE - dash}
            rotation={-90}
            origin="12, 12"
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
              fontSize: 12,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
            }}
          >
            {display}
          </Text>
        </View>
      </View>
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
    </View>
  );
}

function WhoopHeaderSkeleton() {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        gap: 20,
        paddingTop: 4,
        paddingBottom: 12,
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 1, 2].map((key) => (
        <View key={key} style={{ alignItems: "center", width: 64, gap: 4 }}>
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

function WhoopHeader({ snapshot }: { snapshot: WhoopSnapshot }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        gap: 20,
        paddingTop: 4,
        paddingBottom: 12,
      }}
    >
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
