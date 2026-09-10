/** Cursor prepaid token usage types (mirrors server `cursorPrepaidUsage`). */

export const PREPAID_RANGE_IDS = ["1d", "7d", "30d", "mtd", "last_month"] as const;
export type PrepaidRangeId = (typeof PREPAID_RANGE_IDS)[number];

export const PREPAID_RANGE_OPTIONS = [
  { id: "1d", label: "Past 24h" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "mtd", label: "MTD" },
  { id: "last_month", label: "Last month" },
] as const satisfies ReadonlyArray<{ readonly id: PrepaidRangeId; readonly label: string }>;

export type CursorPrepaidEvent = {
  readonly timestampMs: number;
  readonly type: "included" | "on_demand";
  readonly model: string;
  readonly tokens: number;
  readonly costLabel: string;
  readonly chargedCents: number | null;
};

export type CursorPrepaidCumulativeDay = {
  readonly day: string;
  readonly byModel: Readonly<Record<string, number>>;
};

export type CursorPrepaidUsage = {
  readonly available: boolean;
  readonly range: PrepaidRangeId;
  readonly startMs: number;
  readonly endMs: number;
  readonly totalTokens: number;
  readonly includedTokens: number;
  readonly onDemandTokens: number;
  readonly models: readonly string[];
  readonly days: readonly string[];
  readonly cumulativeByDay: readonly CursorPrepaidCumulativeDay[];
  readonly events: readonly CursorPrepaidEvent[];
  readonly eventCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly truncated: boolean;
  readonly error?: string | null;
  readonly sampledAt: number;
};

/** Must stay in sync with server `EVENTS_PAGE_SIZE` in cursorPrepaidUsage.ts */
export const PREPAID_EVENTS_PAGE_SIZE = 50;

export function emptyCursorPrepaidUsage(range: PrepaidRangeId, error: string): CursorPrepaidUsage {
  return {
    available: false,
    range,
    startMs: Date.now(),
    endMs: Date.now(),
    totalTokens: 0,
    includedTokens: 0,
    onDemandTokens: 0,
    models: [],
    days: [],
    cumulativeByDay: [],
    events: [],
    eventCount: 0,
    page: 1,
    pageSize: PREPAID_EVENTS_PAGE_SIZE,
    pageCount: 1,
    truncated: false,
    error,
    sampledAt: Date.now(),
  };
}

export function isPrepaidRangeId(value: unknown): value is PrepaidRangeId {
  return typeof value === "string" && (PREPAID_RANGE_IDS as readonly string[]).includes(value);
}

export function formatPrepaidRangeLabel(startMs: number, endMs: number): string {
  const format = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${format(startMs)} to ${format(endMs)}`;
}

/** Resolve inclusive-ish [start, end] window in ms for a prepaid range preset. */
export function resolvePrepaidRange(
  range: PrepaidRangeId,
  nowMs: number = Date.now(),
): { startMs: number; endMs: number } {
  const endMs = nowMs;
  const now = new Date(nowMs);
  switch (range) {
    case "1d":
      return { startMs: endMs - 24 * 60 * 60 * 1000, endMs };
    case "7d":
      return { startMs: endMs - 7 * 24 * 60 * 60 * 1000, endMs };
    case "30d":
      return { startMs: endMs - 30 * 24 * 60 * 60 * 1000, endMs };
    case "mtd": {
      const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      return { startMs, endMs };
    }
    case "last_month": {
      const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
      const endExclusive = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      return { startMs, endMs: endExclusive - 1 };
    }
  }
}

export function prepaidWindowLabel(range: PrepaidRangeId, nowMs: number = Date.now()): string {
  const { startMs, endMs } = resolvePrepaidRange(range, nowMs);
  return formatPrepaidRangeLabel(startMs, endMs);
}

/** Convert cumulative-by-day totals into per-day deltas for the Premium-style chart. */
export function prepaidDailyColumnsFromCumulative(usage: CursorPrepaidUsage): {
  readonly periods: readonly string[];
  readonly columns: readonly {
    readonly bands: readonly { readonly id: string; readonly value: number }[];
    readonly total: number;
  }[];
} {
  const periods = usage.days;
  const models = usage.models;
  const columns = periods.map((day, index) => {
    const current = usage.cumulativeByDay[index]?.byModel ?? {};
    const previous = index > 0 ? (usage.cumulativeByDay[index - 1]?.byModel ?? {}) : {};
    const bands = models.map((model) => ({
      id: model,
      value: Math.max(0, (current[model] ?? 0) - (previous[model] ?? 0)),
    }));
    return {
      bands,
      total: bands.reduce((sum, band) => sum + band.value, 0),
    };
  });
  return { periods, columns };
}

/**
 * Scale included/on-demand from a sample page onto the aggregate total.
 * Used when summary loads without scanning every event.
 */
export function estimatePrepaidIncludedOnDemand(
  sampleEvents: readonly CursorPrepaidEvent[],
  totalTokens: number,
): { includedTokens: number; onDemandTokens: number } {
  if (totalTokens <= 0) return { includedTokens: 0, onDemandTokens: 0 };
  let sampleIncluded = 0;
  let sampleOnDemand = 0;
  for (const event of sampleEvents) {
    if (event.type === "on_demand") sampleOnDemand += event.tokens;
    else sampleIncluded += event.tokens;
  }
  const sampleTotal = sampleIncluded + sampleOnDemand;
  if (sampleTotal <= 0) {
    return { includedTokens: totalTokens, onDemandTokens: 0 };
  }
  const onDemandTokens = Math.round(totalTokens * (sampleOnDemand / sampleTotal));
  return {
    includedTokens: Math.max(0, totalTokens - onDemandTokens),
    onDemandTokens,
  };
}

export function formatPrepaidEventDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

const MODEL_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#14b8a6",
  "#a855f7",
] as const;

export function colorForPrepaidModel(model: string, models: readonly string[]): string {
  const index = Math.max(0, models.indexOf(model));
  return MODEL_COLORS[index % MODEL_COLORS.length] ?? MODEL_COLORS[0];
}

export function prepaidEventsToCsv(events: readonly CursorPrepaidEvent[]): string {
  const header = "Date (UTC),Type,Model,Tokens,Cost";
  const rows = events.map((event) => {
    const date = new Date(event.timestampMs)
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, " UTC");
    const type = event.type === "on_demand" ? "On-demand" : "Included";
    const model = JSON.stringify(event.model);
    return `${date},${type},${model},${event.tokens},${JSON.stringify(event.costLabel)}`;
  });
  return [header, ...rows].join("\n");
}
