import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatDayShort, formatTokens } from "@t3tools/shared/usageFormat";
import {
  colorForPrepaidModel,
  emptyCursorPrepaidUsage,
  estimatePrepaidIncludedOnDemand,
  formatPrepaidEventDate,
  prepaidDailyColumnsFromCumulative,
  prepaidEventsToCsv,
  type CursorPrepaidUsage,
  type PrepaidRangeId,
} from "~/backsteros/cursorPrepaidUsage";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { UsageSeriesChart } from "./UsageSeriesChart";

const CURSOR_PREPAID_USAGE_PATH = "/api/cursor-prepaid-usage";

async function fetchPrepaidPart(
  range: PrepaidRangeId,
  part: "summary" | "events",
  page: number,
  options: { readonly refresh?: boolean } = {},
): Promise<CursorPrepaidUsage> {
  const params = new URLSearchParams({
    range,
    part,
    page: String(page),
  });
  if (options.refresh) params.set("refresh", "1");
  const response = await fetch(`${CURSOR_PREPAID_USAGE_PATH}?${params}`, {
    cache: "no-store",
  });
  const data = (await response.json()) as { usage?: CursorPrepaidUsage | null };
  return data.usage ?? emptyCursorPrepaidUsage(range, "Cursor prepaid usage unavailable");
}

function downloadCsv(usage: CursorPrepaidUsage) {
  const csv = prepaidEventsToCsv(usage.events);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cursor-prepaid-usage-${usage.range}-p${usage.page}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Prepaid body (KPIs, Premium-styled chart, paginated events).
 * Summary (chart/KPIs) and events load as separate requests so the table is not
 * blocked by daily aggregate fan-out — and page flips only hit the events API.
 */
export function UsagePrepaidSection({
  range,
  refreshNonce,
}: {
  readonly range: PrepaidRangeId;
  readonly refreshNonce: number;
}) {
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<CursorPrepaidUsage | null>(null);
  const [events, setEvents] = useState<CursorPrepaidUsage | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [splitAppliedForRange, setSplitAppliedForRange] = useState<PrepaidRangeId | null>(null);
  const lastRefreshNonceRef = useRef(refreshNonce);

  useEffect(() => {
    setPage(1);
  }, [range, refreshNonce]);

  // KPIs + chart — only on range / refresh (not page flips).
  useEffect(() => {
    let cancelled = false;
    const refresh = refreshNonce !== lastRefreshNonceRef.current;
    lastRefreshNonceRef.current = refreshNonce;
    setSummaryLoading(true);
    setSplitAppliedForRange(null);

    void fetchPrepaidPart(range, "summary", 1, { refresh }).then((next) => {
      if (cancelled) return;
      setSummary(next);
      setSummaryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [range, refreshNonce]);

  // Events table — one 50-row Cursor page per request.
  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);

    void fetchPrepaidPart(range, "events", page).then((next) => {
      if (cancelled) return;
      setEvents(next);
      setEventsLoading(false);
      if (next.page !== page) setPage(next.page);
    });
    return () => {
      cancelled = true;
    };
  }, [range, page, refreshNonce]);

  // Refine included/on-demand once per range from the newest events sample.
  useEffect(() => {
    if (!summary?.available || !events?.available) return;
    if (splitAppliedForRange === range) return;
    if (events.events.length === 0 && events.eventCount === 0) {
      setSplitAppliedForRange(range);
      return;
    }
    const split = estimatePrepaidIncludedOnDemand(events.events, summary.totalTokens);
    setSummary((current) =>
      current == null
        ? current
        : {
            ...current,
            includedTokens: split.includedTokens,
            onDemandTokens: split.onDemandTokens,
          },
    );
    setSplitAppliedForRange(range);
  }, [summary, events, range, splitAppliedForRange]);

  const usage = useMemo((): CursorPrepaidUsage | null => {
    if (summary == null && events == null) return null;
    if (summary != null && !summary.available && events == null) return summary;
    if (summary == null && events != null && !events.available) return events;
    if (summary?.available) {
      return {
        ...summary,
        events: events?.events ?? [],
        eventCount: events?.eventCount ?? 0,
        page: events?.page ?? 1,
        pageSize: events?.pageSize ?? summary.pageSize,
        pageCount: events?.pageCount ?? 1,
        truncated: false,
      };
    }
    if (events?.available) {
      return {
        ...emptyCursorPrepaidUsage(range, ""),
        available: true,
        error: null,
        events: events.events,
        eventCount: events.eventCount,
        page: events.page,
        pageSize: events.pageSize,
        pageCount: events.pageCount,
      };
    }
    return summary ?? events;
  }, [summary, events, range]);

  const pageWindowLabel = useMemo(() => {
    if (!usage || usage.events.length === 0) {
      return usage && events ? `${usage.eventCount.toLocaleString()} events` : null;
    }
    const start = (usage.page - 1) * usage.pageSize + 1;
    const end = start + usage.events.length - 1;
    return `${start.toLocaleString()}–${end.toLocaleString()} of ${usage.eventCount.toLocaleString()}`;
  }, [usage, events]);

  const chartModel = useMemo(() => {
    if (!summary?.available) return null;
    const { periods, columns } = prepaidDailyColumnsFromCumulative(summary);
    const series = summary.models.map((model) => ({
      id: model,
      label: model,
      color: colorForPrepaidModel(model, summary.models),
    }));
    return { periods, columns, series };
  }, [summary]);

  const showFullSkeleton = summaryLoading && !summary && eventsLoading && !events;
  const showSummarySkeleton = summaryLoading && !summary?.available;
  const showEventsSkeleton = eventsLoading && !events?.available;

  return (
    <div className="flex flex-col gap-6 pb-10">
      {showFullSkeleton ? (
        <PrepaidSkeleton />
      ) : usage && !usage.available && !summary?.available && !events?.available ? (
        <p className="text-sm text-muted-foreground">
          {usage.error?.trim() || "Cursor prepaid usage unavailable"}
        </p>
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            {showSummarySkeleton ? (
              <>
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
                <Skeleton className="h-72 w-full rounded-xl" />
              </>
            ) : summary?.available ? (
              <>
                <div className="flex min-w-0 flex-col gap-5">
                  <div className="flex flex-col gap-1">
                    <span className="text-4xl font-semibold text-foreground tabular-nums">
                      {formatTokens(summary.totalTokens)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTokens(summary.includedTokens)} included ·{" "}
                      {formatTokens(summary.onDemandTokens)} on-demand
                    </span>
                  </div>
                  <div className="flex max-h-56 min-h-0 flex-col gap-5 overflow-y-auto pe-1">
                    {summary.models.map((model) => {
                      const modelTokens = summary.cumulativeByDay.at(-1)?.byModel[model] ?? 0;
                      const share = summary.totalTokens > 0 ? modelTokens / summary.totalTokens : 0;
                      return (
                        <div key={model} className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                              <span
                                aria-hidden
                                className="size-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: colorForPrepaidModel(model, summary.models),
                                }}
                              />
                              <span className="truncate font-mono text-[12px]">{model}</span>
                            </span>
                            <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">
                              {formatTokens(modelTokens)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(share * 1000) / 10}% of tokens
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                  <h2 className="text-sm font-medium text-foreground">Daily processed tokens</h2>
                  {chartModel && chartModel.periods.length > 0 && chartModel.series.length > 0 ? (
                    <UsageSeriesChart
                      periods={chartModel.periods}
                      series={chartModel.series}
                      columns={chartModel.columns}
                      formatValue={formatTokens}
                      formatPeriod={formatDayShort}
                      ariaLabel="Daily Cursor prepaid tokens by model"
                    />
                  ) : (
                    <p className="py-10 text-sm text-muted-foreground">
                      No usage to chart in this window
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground lg:col-span-2">
                {summary?.error?.trim() || "Cursor prepaid summary unavailable"}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {pageWindowLabel}
                {eventsLoading && events?.available ? " · loading…" : null}
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabled={!usage || usage.events.length === 0}
                onClick={() => usage && downloadCsv(usage)}
              >
                <DownloadIcon className="size-3.5" />
                Export page
              </Button>
            </div>
            {showEventsSkeleton ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : (
              <div
                className={cn(
                  "overflow-x-auto rounded-xl border border-border/60 transition-opacity",
                  eventsLoading && "opacity-60",
                )}
              >
                <table className="w-full min-w-[40rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Date (UTC)</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 text-right font-medium">Tokens</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!events?.available ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          {events?.error?.trim() || "Cursor prepaid events unavailable"}
                        </td>
                      </tr>
                    ) : events.events.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          No usage events in this range
                        </td>
                      </tr>
                    ) : (
                      events.events.map((event, index) => (
                        <tr
                          key={`${event.timestampMs}-${event.model}-${index}`}
                          className="border-b border-border/40 last:border-0"
                        >
                          <td className="px-3 py-2 tabular-nums text-foreground/90">
                            {formatPrepaidEventDate(event.timestampMs)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {event.type === "on_demand" ? "On-demand" : "Included"}
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px] text-foreground/85">
                            {event.model}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground/90">
                            {formatTokens(event.tokens)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {event.costLabel}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {events?.available && events.pageCount > 1 ? (
              <div className="flex items-center justify-between gap-3">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={events.page <= 1 || eventsLoading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeftIcon className="size-3.5" />
                  Previous
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  Page {events.page} of {events.pageCount}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={events.page >= events.pageCount || eventsLoading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                  <ChevronRightIcon className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function PrepaidSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
