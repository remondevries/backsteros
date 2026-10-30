"use client";

import { useEffect, useMemo, useState } from "react";

import type { SocialAnalyticsSnapshot } from "@backsteros/contracts";

import {
  getSocialMockAnalyticsForAccount,
  getSocialMockAnalyticsMetrics,
  getSocialMockAnalyticsSelection,
  getSocialMockPlatformIdsForAccount,
  isSocialMockAnalyticsPeriodId,
  isSocialMockAnalyticsPlatformFilterId,
  isSocialMockAnalyticsSelectionId,
  SOCIAL_MOCK_ANALYTICS_PLATFORM_BREAKDOWN,
  SOCIAL_MOCK_ANALYTICS_TOP_POSTS,
  type SocialMockAccountKind,
  type SocialMockAnalyticsMetric,
  type SocialMockAnalyticsPeriodId,
  type SocialMockAnalyticsPlatformFilterId,
  type SocialMockAnalyticsSelectionId,
  type SocialMockPostPlatform,
} from "../../social/social-mock-data.js";
import type { SocialAnalyticsClient } from "../../social/social-analytics.js";
import {
  getSocialAnalyticsHref,
  getSocialAnalyticsMetricFromSearch,
  getSocialAnalyticsPeriodFromSearch,
  getSocialAnalyticsPlatformFromSearch,
  getSocialPostHref,
  SOCIAL_PLATFORM_NAV_ITEMS,
} from "../../social/social-nav.js";
import { ClientLink } from "../../shared/client-link.js";
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "../list-nav/list-board-view-shell.js";
import { PillNav } from "../shared/pill-nav.js";
import { SocialAnalyticsTimelineChart } from "./social-analytics-timeline-chart.js";

export type SocialAnalyticsViewProps = {
  searchStr?: string;
  accountKind?: SocialMockAccountKind;
  /** Live LinkedIn analytics from core → Zernio. */
  analyticsClient?: SocialAnalyticsClient | null;
};

const PERIOD_OPTIONS: readonly SegmentedPillToggleOption<SocialMockAnalyticsPeriodId>[] =
  [
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
  ];

function resolveMetric(
  searchStr: string,
): SocialMockAnalyticsSelectionId {
  const raw = getSocialAnalyticsMetricFromSearch(searchStr);
  if (isSocialMockAnalyticsSelectionId(raw)) return raw;
  return "impressions";
}

function resolvePeriod(searchStr: string): SocialMockAnalyticsPeriodId {
  const raw = getSocialAnalyticsPeriodFromSearch(searchStr);
  if (isSocialMockAnalyticsPeriodId(raw)) return raw;
  return "7d";
}

function resolvePlatform(
  searchStr: string,
): SocialMockAnalyticsPlatformFilterId {
  const raw = getSocialAnalyticsPlatformFromSearch(searchStr);
  if (isSocialMockAnalyticsPlatformFilterId(raw)) return raw;
  return "all";
}

function platformLabel(platform: string): string {
  return (
    SOCIAL_PLATFORM_NAV_ITEMS.find((item) => item.id === platform)?.label ??
    platform
  );
}

function livePlatformFilter(
  platform: SocialMockAnalyticsPlatformFilterId,
): "all" | "linkedin" {
  return platform === "linkedin" ? "linkedin" : "all";
}

function snapshotMetricSelection(
  snapshot: SocialAnalyticsSnapshot,
  selectedId: SocialMockAnalyticsSelectionId,
): {
  title: string;
  subtitle: string;
  valueFormat: "count" | "percent";
  series: SocialAnalyticsSnapshot["metrics"][number]["series"];
} {
  if (selectedId === "top-post") {
    return {
      title: snapshot.topPostTitle?.trim() || "Top post",
      subtitle: "Engagement over the period",
      valueFormat: "count",
      series: snapshot.topPostSeries,
    };
  }
  const metric =
    snapshot.metrics.find((row) => row.id === selectedId) ??
    snapshot.metrics.find((row) => row.id === "impressions")!;
  return {
    title: metric.label,
    subtitle: snapshot.periodLabel,
    valueFormat: metric.valueFormat,
    series: metric.series,
  };
}

export function SocialAnalyticsView({
  searchStr = "",
  accountKind = "personal",
  analyticsClient = null,
}: SocialAnalyticsViewProps) {
  const selectedId = resolveMetric(searchStr);
  const periodFromSearch = resolvePeriod(searchStr);
  const platformFromSearch = resolvePlatform(searchStr);
  const [period, setPeriod] =
    useState<SocialMockAnalyticsPeriodId>(periodFromSearch);
  const [platform, setPlatform] =
    useState<SocialMockAnalyticsPlatformFilterId>(platformFromSearch);
  const live = analyticsClient != null;
  const ownedPlatforms = useMemo((): SocialMockPostPlatform[] => {
    if (live) return ["linkedin"];
    return [...getSocialMockPlatformIdsForAccount(accountKind)];
  }, [accountKind, live]);
  const ownsPlatform = (id: string) =>
    ownedPlatforms.some((platformId) => platformId === id);
  const platformTabs = useMemo(
    () => [
      { value: "all" as const, label: "All" },
      ...ownedPlatforms.map((id) => ({
        value: id as SocialMockAnalyticsPlatformFilterId,
        label:
          SOCIAL_PLATFORM_NAV_ITEMS.find((item) => item.id === id)?.label ?? id,
      })),
    ],
    [ownedPlatforms],
  );
  const accountAnalytics = getSocialMockAnalyticsForAccount(accountKind);

  const [snapshot, setSnapshot] = useState<SocialAnalyticsSnapshot | null>(
    null,
  );
  const [loadStatus, setLoadStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setPeriod(periodFromSearch);
  }, [periodFromSearch]);

  useEffect(() => {
    setPlatform(platformFromSearch);
  }, [platformFromSearch]);

  useEffect(() => {
    if (
      platform !== "all" &&
      !ownedPlatforms.some((platformId) => platformId === platform)
    ) {
      setPlatform("all");
    }
  }, [ownedPlatforms, platform]);

  useEffect(() => {
    if (!analyticsClient) {
      setSnapshot(null);
      setLoadStatus("idle");
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoadStatus("loading");
    setLoadError(null);
    void analyticsClient
      .get({
        accountKind,
        period,
        platform: livePlatformFilter(platform),
      })
      .then((next) => {
        if (cancelled) return;
        setSnapshot(next);
        setLoadStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSnapshot(null);
        setLoadStatus("error");
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load LinkedIn analytics.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [accountKind, analyticsClient, period, platform]);

  const mockMetrics = useMemo(
    () => getSocialMockAnalyticsMetrics(period, platform),
    [period, platform],
  );

  const metrics: readonly SocialMockAnalyticsMetric[] = snapshot
    ? snapshot.metrics
    : mockMetrics;

  const selection = useMemo(() => {
    if (snapshot) return snapshotMetricSelection(snapshot, selectedId);
    return (
      getSocialMockAnalyticsSelection(selectedId, { period, platform }) ??
      getSocialMockAnalyticsSelection("impressions", { period, platform })!
    );
  }, [period, platform, selectedId, snapshot]);

  const topPosts = snapshot
    ? snapshot.topPosts
    : SOCIAL_MOCK_ANALYTICS_TOP_POSTS.filter((post) => {
        if (!ownsPlatform(post.platform)) return false;
        if (platform !== "all" && post.platform !== platform) return false;
        return true;
      });

  const platformRows = snapshot
    ? snapshot.platformBreakdown
    : SOCIAL_MOCK_ANALYTICS_PLATFORM_BREAKDOWN.filter((row) => {
        if (!ownsPlatform(row.id)) return false;
        if (platform !== "all" && row.id !== platform) return false;
        return true;
      });

  const periodLabel = snapshot
    ? snapshot.periodLabel
    : period === "7d"
      ? "Last 7 days"
      : "Last 30 days";
  const scopeLabel = snapshot
    ? snapshot.subtitle
    : platform === "all"
      ? accountAnalytics.subtitle
      : platformLabel(platform);

  return (
    <div className="social-feed social-analytics">
      <header className="social-feed__chrome social-analytics__chrome">
        <div className="social-analytics__chrome-row">
          <div className="social-analytics__chrome-copy">
            <h1 className="social-feed__title">Analytics</h1>
            <p className="social-analytics__chrome-meta">
              {scopeLabel} · {periodLabel}
            </p>
          </div>
          <div className="social-analytics__period">
            <SegmentedPillToggle
              value={period}
              options={PERIOD_OPTIONS}
              onChange={setPeriod}
              ariaLabel="Period"
            />
          </div>
        </div>

        <PillNav
          className="social-feed__tabs social-analytics__tabs"
          ariaLabel="Platform"
          items={platformTabs}
          value={platform}
          onChange={setPlatform}
          slidingIndicator
        />
      </header>

      {loadStatus === "loading" && live ? (
        <p className="social-analytics__empty" role="status">
          Loading LinkedIn analytics…
        </p>
      ) : null}
      {loadError ? (
        <p className="social-feed__composer-error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="social-analytics__scroll">
        <section
          className="social-analytics__chart-card"
          aria-label={`${selection.title} timeline`}
        >
          <div className="social-analytics__chart-header">
            <div className="social-analytics__chart-copy">
              <h2 className="social-analytics__chart-title">
                {selection.title}
              </h2>
              <p className="social-analytics__chart-subtitle">
                {selection.subtitle}
              </p>
            </div>
            {selectedId !== "top-post" ? (
              <ClientLink
                href={getSocialAnalyticsHref({
                  metric: "top-post",
                  period,
                  platform,
                })}
                className="social-analytics__chart-action"
              >
                Top post
              </ClientLink>
            ) : (
              <ClientLink
                href={getSocialAnalyticsHref({
                  metric: "impressions",
                  period,
                  platform,
                })}
                className="social-analytics__chart-action"
              >
                Back to metrics
              </ClientLink>
            )}
          </div>
          <SocialAnalyticsTimelineChart
            className="social-analytics-timeline--page"
            series={selection.series}
            valueFormat={selection.valueFormat}
            size="page"
          />
        </section>

        <section
          className="social-analytics__metrics"
          aria-label="Summary metrics"
        >
          {metrics.map((metric) => {
            const selected = selectedId === metric.id;
            return (
              <ClientLink
                key={metric.id}
                href={getSocialAnalyticsHref({
                  metric: metric.id,
                  period,
                  platform,
                })}
                className={[
                  "social-analytics__metric",
                  selected ? "social-analytics__metric--selected" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={selected ? "page" : undefined}
              >
                <span className="social-analytics__metric-label">
                  {metric.label}
                </span>
                <span className="social-analytics__metric-value">
                  {metric.valueLabel}
                </span>
                <span
                  className={[
                    "social-analytics__metric-delta",
                    `social-analytics__metric-delta--${metric.delta}`,
                  ].join(" ")}
                >
                  {metric.deltaLabel}
                </span>
              </ClientLink>
            );
          })}
        </section>

        <div className="social-analytics__panels">
          <section
            className="social-analytics__panel"
            aria-label="Platform breakdown"
          >
            <header className="social-analytics__panel-header">
              <h2 className="social-analytics__panel-title">By platform</h2>
              <p className="social-analytics__panel-subtitle">
                Share of impressions
              </p>
            </header>
            {platformRows.length === 0 ? (
              <p className="social-analytics__empty">
                Connect LinkedIn in Settings → Social to see platform stats.
              </p>
            ) : (
              <ul className="social-analytics__platform-list">
                {platformRows.map((row) => (
                  <li key={row.id} className="social-analytics__platform-row">
                    <button
                      type="button"
                      className="social-analytics__platform-link"
                      onClick={() => setPlatform(row.id)}
                    >
                      <span className="social-analytics__platform-name">
                        {row.label}
                      </span>
                      <span className="social-analytics__platform-stats">
                        {row.impressionsLabel} · {row.engagementLabel}
                      </span>
                      <span
                        className="social-analytics__platform-bar"
                        role="presentation"
                      >
                        <span
                          className="social-analytics__platform-bar-fill"
                          style={{ width: `${row.sharePercent}%` }}
                        />
                      </span>
                      <span className="social-analytics__platform-share">
                        {row.sharePercent}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="social-analytics__panel"
            aria-label="Top posts"
          >
            <header className="social-analytics__panel-header">
              <h2 className="social-analytics__panel-title">Top posts</h2>
              <p className="social-analytics__panel-subtitle">{periodLabel}</p>
            </header>
            {topPosts.length === 0 ? (
              <p className="social-analytics__empty">
                {live
                  ? "No LinkedIn post analytics in this period yet. Publish from Network and check back after Zernio syncs stats."
                  : "No posts in this filter yet."}
              </p>
            ) : (
              <div className="social-analytics__posts">
                <div className="social-analytics__posts-head" aria-hidden="true">
                  <span>Post</span>
                  <span>Impr.</span>
                  <span>Eng.</span>
                  <span>Rate</span>
                </div>
                <ul className="social-analytics__posts-list">
                  {topPosts.map((post) => (
                    <li key={post.id}>
                      <ClientLink
                        href={getSocialPostHref(post.postId)}
                        className="social-analytics__post-row"
                      >
                        <span className="social-analytics__post-main">
                          <span className="social-analytics__post-title">
                            {post.title}
                          </span>
                          <span className="social-analytics__post-platform">
                            {platformLabel(post.platform)}
                          </span>
                        </span>
                        <span className="social-analytics__post-stat">
                          {post.impressionsLabel}
                        </span>
                        <span className="social-analytics__post-stat">
                          {post.engagementLabel}
                        </span>
                        <span className="social-analytics__post-stat">
                          {post.engagementRateLabel}
                        </span>
                      </ClientLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
