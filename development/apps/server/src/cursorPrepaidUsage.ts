/**
 * Cursor prepaid / included token usage for the Usage → Prepaid page.
 *
 * Fast path (Premium-like):
 * - KPIs + chart from GetAggregatedUsageEvents (window + per-day)
 * - Event table from a single GetFilteredUsageEvents page (50 rows)
 *
 * We deliberately do **not** scan all filtered events up front — that was the
 * multi-second stall when a window had ~2k+ rows.
 */
import { postCursorJson, resolveCursorAccessToken } from "./cursorUsage.ts";

const FILTERED_EVENTS_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetFilteredUsageEvents";
const AGGREGATED_EVENTS_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetAggregatedUsageEvents";

/** Events returned to the web client per page. */
export const EVENTS_PAGE_SIZE = 50;
const AGGREGATE_CACHE_TTL_MS = 60_000;
const DAILY_AGG_CONCURRENCY = 6;

export const PREPAID_RANGE_IDS = ["1d", "7d", "30d", "mtd", "last_month"] as const;
export type PrepaidRangeId = (typeof PREPAID_RANGE_IDS)[number];

export function isPrepaidRangeId(value: unknown): value is PrepaidRangeId {
  return typeof value === "string" && (PREPAID_RANGE_IDS as readonly string[]).includes(value);
}

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

type PrepaidAggregateBundle = {
  readonly sampledAt: number;
  readonly range: PrepaidRangeId;
  readonly startMs: number;
  readonly endMs: number;
  readonly totalTokens: number;
  readonly includedTokens: number;
  readonly onDemandTokens: number;
  readonly models: readonly string[];
  readonly days: readonly string[];
  readonly cumulativeByDay: readonly CursorPrepaidCumulativeDay[];
};

let aggregateCache: PrepaidAggregateBundle | null = null;

type RawTokenUsage = {
  readonly inputTokens?: number | string;
  readonly outputTokens?: number | string;
  readonly cacheWriteTokens?: number | string;
  readonly cacheReadTokens?: number | string;
  readonly totalCents?: number;
};

type RawUsageEvent = {
  readonly timestamp?: string | number;
  readonly model?: string;
  readonly kind?: string;
  readonly usageBasedCosts?: string;
  readonly tokenUsage?: RawTokenUsage;
  readonly chargedCents?: number;
};

type RawAggregation = {
  readonly modelIntent?: string;
  readonly inputTokens?: number | string;
  readonly outputTokens?: number | string;
  readonly cacheWriteTokens?: number | string;
  readonly cacheReadTokens?: number | string;
  readonly totalCents?: number;
  readonly tier?: number;
};

function unavailable(
  range: PrepaidRangeId,
  startMs: number,
  endMs: number,
  error: string,
  page = 1,
): CursorPrepaidUsage {
  return {
    available: false,
    range,
    startMs,
    endMs,
    totalTokens: 0,
    includedTokens: 0,
    onDemandTokens: 0,
    models: [],
    days: [],
    cumulativeByDay: [],
    events: [],
    eventCount: 0,
    page,
    pageSize: EVENTS_PAGE_SIZE,
    pageCount: 1,
    truncated: false,
    error,
    sampledAt: Date.now(),
  };
}

function asMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function asTokenCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

function eventTokens(tokenUsage: RawTokenUsage | undefined): number {
  if (!tokenUsage) return 0;
  return (
    asTokenCount(tokenUsage.inputTokens) +
    asTokenCount(tokenUsage.outputTokens) +
    asTokenCount(tokenUsage.cacheWriteTokens) +
    asTokenCount(tokenUsage.cacheReadTokens)
  );
}

function aggregationTokens(row: RawAggregation): number {
  return (
    asTokenCount(row.inputTokens) +
    asTokenCount(row.outputTokens) +
    asTokenCount(row.cacheWriteTokens) +
    asTokenCount(row.cacheReadTokens)
  );
}

function isOnDemandKind(kind: string | undefined): boolean {
  return typeof kind === "string" && kind.includes("USAGE_BASED");
}

function formatCostLabel(
  type: "included" | "on_demand",
  usageBasedCosts: string | undefined,
  chargedCents: number | null,
): string {
  if (type === "included") return "Included";
  if (usageBasedCosts && usageBasedCosts !== "-" && usageBasedCosts.trim()) {
    return usageBasedCosts.trim();
  }
  if (chargedCents != null && Number.isFinite(chargedCents)) {
    return `$${(chargedCents / 100).toFixed(2)}`;
  }
  return "—";
}

function enumerateUtcDays(startMs: number, endMs: number): string[] {
  const days: string[] = [];
  const start = Date.UTC(
    new Date(startMs).getUTCFullYear(),
    new Date(startMs).getUTCMonth(),
    new Date(startMs).getUTCDate(),
  );
  const end = Date.UTC(
    new Date(endMs).getUTCFullYear(),
    new Date(endMs).getUTCMonth(),
    new Date(endMs).getUTCDate(),
  );
  for (let cursor = start; cursor <= end; cursor += 24 * 60 * 60 * 1000) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days;
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

function normalizePage(page: number, pageCount: number): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), Math.max(pageCount, 1));
}

function pageCountFor(eventCount: number): number {
  return Math.max(1, Math.ceil(Math.max(0, eventCount) / EVENTS_PAGE_SIZE));
}

function dayBoundsMs(
  day: string,
  windowStartMs: number,
  windowEndMs: number,
): {
  startMs: number;
  endMs: number;
} {
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
  return {
    startMs: Math.max(windowStartMs, dayStart),
    endMs: Math.min(windowEndMs, dayEnd),
  };
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchAggregatedUsage(
  token: string,
  startMs: number,
  endMs: number,
): Promise<{
  readonly byModel: Map<string, number>;
  readonly totalTokens: number;
}> {
  const payload = await postCursorJson(token, AGGREGATED_EVENTS_URL, {
    startDate: String(startMs),
    endDate: String(endMs),
  });
  if (!payload || typeof payload !== "object") {
    throw new Error("Cursor aggregated usage unavailable");
  }
  const raw = payload as {
    aggregations?: RawAggregation[];
    totalInputTokens?: number | string;
    totalOutputTokens?: number | string;
    totalCacheWriteTokens?: number | string;
    totalCacheReadTokens?: number | string;
  };

  const byModel = new Map<string, number>();
  for (const row of raw.aggregations ?? []) {
    const model = (row.modelIntent ?? "unknown").trim() || "unknown";
    byModel.set(model, (byModel.get(model) ?? 0) + aggregationTokens(row));
  }

  const totalFromFields =
    asTokenCount(raw.totalInputTokens) +
    asTokenCount(raw.totalOutputTokens) +
    asTokenCount(raw.totalCacheWriteTokens) +
    asTokenCount(raw.totalCacheReadTokens);
  const totalFromModels = [...byModel.values()].reduce((sum, value) => sum + value, 0);

  return {
    byModel,
    totalTokens: totalFromFields > 0 ? totalFromFields : totalFromModels,
  };
}

function normalizeEvent(raw: RawUsageEvent): CursorPrepaidEvent | null {
  const timestampMs = asMs(raw.timestamp);
  if (timestampMs == null) return null;
  const model = (raw.model ?? "unknown").trim() || "unknown";
  const tokens = eventTokens(raw.tokenUsage);
  const type: "included" | "on_demand" = isOnDemandKind(raw.kind) ? "on_demand" : "included";
  const chargedCents =
    typeof raw.chargedCents === "number" && Number.isFinite(raw.chargedCents)
      ? raw.chargedCents
      : typeof raw.tokenUsage?.totalCents === "number"
        ? raw.tokenUsage.totalCents
        : null;
  return {
    timestampMs,
    type,
    model,
    tokens,
    costLabel: formatCostLabel(type, raw.usageBasedCosts, chargedCents),
    chargedCents,
  };
}

async function fetchFilteredEventsPage(
  token: string,
  startMs: number,
  endMs: number,
  page: number,
): Promise<{
  readonly events: CursorPrepaidEvent[];
  readonly eventCount: number;
  readonly page: number;
  readonly pageCount: number;
}> {
  const payload = await postCursorJson(token, FILTERED_EVENTS_URL, {
    startDate: String(startMs),
    endDate: String(endMs),
    page,
    pageSize: EVENTS_PAGE_SIZE,
  });
  if (!payload || typeof payload !== "object") {
    throw new Error("Cursor usage events unavailable");
  }
  const raw = payload as {
    totalUsageEventsCount?: number;
    usageEventsDisplay?: RawUsageEvent[];
  };
  const eventCount =
    typeof raw.totalUsageEventsCount === "number" && Number.isFinite(raw.totalUsageEventsCount)
      ? Math.max(0, raw.totalUsageEventsCount)
      : Array.isArray(raw.usageEventsDisplay)
        ? raw.usageEventsDisplay.length
        : 0;
  const pageCount = pageCountFor(eventCount);
  const safePage = normalizePage(page, pageCount);
  // Hard cap: never ship a full-window dump if Cursor ignores pageSize.
  const events = (raw.usageEventsDisplay ?? [])
    .map(normalizeEvent)
    .filter((event): event is CursorPrepaidEvent => event != null)
    .slice(0, EVENTS_PAGE_SIZE);

  // Cursor pages newest-first already; keep that order for the table.
  return { events, eventCount, page: safePage, pageCount };
}

/**
 * Included vs on-demand isn’t in GetAggregatedUsageEvents. Sample the newest
 * events page(s) lightly to estimate the split, scaled to the aggregate total.
 * Prefer speed over exact billing reconciliation.
 */
function estimateIncludedOnDemand(
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
  const onDemandShare = sampleOnDemand / sampleTotal;
  const onDemandTokens = Math.round(totalTokens * onDemandShare);
  return {
    includedTokens: Math.max(0, totalTokens - onDemandTokens),
    onDemandTokens,
  };
}

async function loadAggregateBundle(
  range: PrepaidRangeId,
  token: string,
): Promise<PrepaidAggregateBundle> {
  const { startMs, endMs } = resolvePrepaidRange(range);
  const days = enumerateUtcDays(startMs, endMs);

  const [windowAgg, dailyAggs] = await Promise.all([
    fetchAggregatedUsage(token, startMs, endMs),
    mapPool(days, DAILY_AGG_CONCURRENCY, async (day) => {
      const bounds = dayBoundsMs(day, startMs, endMs);
      if (bounds.endMs < bounds.startMs) {
        return { day, byModel: new Map<string, number>() };
      }
      try {
        const agg = await fetchAggregatedUsage(token, bounds.startMs, bounds.endMs);
        return { day, byModel: agg.byModel };
      } catch {
        return { day, byModel: new Map<string, number>() };
      }
    }),
  ]);

  const modelTotals = new Map<string, number>(windowAgg.byModel);
  for (const day of dailyAggs) {
    for (const [model, tokens] of day.byModel) {
      if (!modelTotals.has(model)) modelTotals.set(model, tokens);
    }
  }

  const models = [...modelTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([model]) => model);

  const running = new Map<string, number>();
  for (const model of models) running.set(model, 0);

  const cumulativeByDay: CursorPrepaidCumulativeDay[] = days.map((day, index) => {
    const dayMap = dailyAggs[index]?.byModel;
    if (dayMap) {
      for (const [model, tokens] of dayMap) {
        running.set(model, (running.get(model) ?? 0) + tokens);
      }
    }
    const byModel: Record<string, number> = {};
    for (const model of models) {
      byModel[model] = running.get(model) ?? 0;
    }
    return { day, byModel };
  });

  // Included/on-demand split is refined by the client from the events sample,
  // or by fetchCursorPrepaidUsage when serving the combined part.
  return {
    sampledAt: Date.now(),
    range,
    startMs,
    endMs,
    totalTokens: windowAgg.totalTokens,
    includedTokens: windowAgg.totalTokens,
    onDemandTokens: 0,
    models,
    days,
    cumulativeByDay,
  };
}

function usageFromBundle(
  bundle: PrepaidAggregateBundle,
  eventsPage: {
    readonly events: readonly CursorPrepaidEvent[];
    readonly eventCount: number;
    readonly page: number;
    readonly pageCount: number;
  },
): CursorPrepaidUsage {
  return {
    available: true,
    range: bundle.range,
    startMs: bundle.startMs,
    endMs: bundle.endMs,
    totalTokens: bundle.totalTokens,
    includedTokens: bundle.includedTokens,
    onDemandTokens: bundle.onDemandTokens,
    models: bundle.models,
    days: bundle.days,
    cumulativeByDay: bundle.cumulativeByDay,
    events: eventsPage.events,
    eventCount: eventsPage.eventCount,
    page: eventsPage.page,
    pageSize: EVENTS_PAGE_SIZE,
    pageCount: eventsPage.pageCount,
    truncated: false,
    error: null,
    sampledAt: Date.now(),
  };
}

/** KPIs + chart only (no event rows). Cached ~60s per range. */
export async function fetchCursorPrepaidSummary(
  range: PrepaidRangeId = "7d",
  options: { readonly bustCache?: boolean } = {},
): Promise<CursorPrepaidUsage> {
  const { startMs, endMs } = resolvePrepaidRange(range);
  const token = await resolveCursorAccessToken();
  if (!token) {
    return unavailable(range, startMs, endMs, "Sign in to Cursor on this machine");
  }

  try {
    const cacheHit =
      !options.bustCache &&
      aggregateCache != null &&
      aggregateCache.range === range &&
      Date.now() - aggregateCache.sampledAt < AGGREGATE_CACHE_TTL_MS
        ? aggregateCache
        : null;

    const bundle = cacheHit ?? (await loadAggregateBundle(range, token));
    if (!cacheHit) aggregateCache = bundle;

    return usageFromBundle(bundle, {
      events: [],
      eventCount: 0,
      page: 1,
      pageCount: 1,
    });
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.trim()
        ? cause.message.trim()
        : "Cursor prepaid usage unavailable";
    return unavailable(range, startMs, endMs, message);
  }
}

/**
 * One Cursor filtered-events page (50 rows). Does not scan the full window.
 * Safe to call on every pagination flip.
 */
export async function fetchCursorPrepaidEvents(
  range: PrepaidRangeId = "7d",
  page = 1,
): Promise<CursorPrepaidUsage> {
  const { startMs, endMs } = resolvePrepaidRange(range);
  const token = await resolveCursorAccessToken();
  if (!token) {
    return unavailable(range, startMs, endMs, "Sign in to Cursor on this machine", page);
  }

  try {
    const safePageHint = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    const eventsPage = await fetchFilteredEventsPage(token, startMs, endMs, safePageHint);
    return {
      available: true,
      range,
      startMs,
      endMs,
      totalTokens: 0,
      includedTokens: 0,
      onDemandTokens: 0,
      models: [],
      days: [],
      cumulativeByDay: [],
      events: eventsPage.events,
      eventCount: eventsPage.eventCount,
      page: eventsPage.page,
      pageSize: EVENTS_PAGE_SIZE,
      pageCount: eventsPage.pageCount,
      truncated: false,
      error: null,
      sampledAt: Date.now(),
    };
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.trim()
        ? cause.message.trim()
        : "Cursor prepaid usage unavailable";
    return unavailable(range, startMs, endMs, message, page);
  }
}

/** Combined summary + events (parallel). Prefer part=summary|events from the client. */
export async function fetchCursorPrepaidUsage(
  range: PrepaidRangeId = "7d",
  page = 1,
  options: { readonly bustCache?: boolean } = {},
): Promise<CursorPrepaidUsage> {
  const { startMs, endMs } = resolvePrepaidRange(range);
  const token = await resolveCursorAccessToken();
  if (!token) {
    return unavailable(range, startMs, endMs, "Sign in to Cursor on this machine", page);
  }

  try {
    const safePageHint = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    const cacheHit =
      !options.bustCache &&
      aggregateCache != null &&
      aggregateCache.range === range &&
      Date.now() - aggregateCache.sampledAt < AGGREGATE_CACHE_TTL_MS
        ? aggregateCache
        : null;

    if (cacheHit) {
      const eventsPage = await fetchFilteredEventsPage(token, startMs, endMs, safePageHint);
      return usageFromBundle(cacheHit, eventsPage);
    }

    // Cold load: one events page + aggregates in parallel (never scan all ~2k events).
    const [eventsPage, bundle] = await Promise.all([
      fetchFilteredEventsPage(token, startMs, endMs, safePageHint),
      loadAggregateBundle(range, token),
    ]);
    const withSplit = {
      ...bundle,
      ...estimateIncludedOnDemand(eventsPage.events, bundle.totalTokens),
    };
    aggregateCache = withSplit;
    return usageFromBundle(withSplit, eventsPage);
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.trim()
        ? cause.message.trim()
        : "Cursor prepaid usage unavailable";
    return unavailable(range, startMs, endMs, message, page);
  }
}
