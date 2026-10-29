"use client";

import { useEffect, useMemo, useState } from "react";

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
  type SocialMockAnalyticsPeriodId,
  type SocialMockAnalyticsPlatformFilterId,
  type SocialMockAnalyticsSelectionId,
} from "../../social/social-mock-data.js";
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

export function SocialAnalyticsView({
  searchStr = "",
  accountKind = "personal",
}: SocialAnalyticsViewProps) {
  const selectedId = resolveMetric(searchStr);
  const periodFromSearch = resolvePeriod(searchStr);
  const platformFromSearch = resolvePlatform(searchStr);
  const [period, setPeriod] =
    useState<SocialMockAnalyticsPeriodId>(periodFromSearch);
  const [platform, setPlatform] =
    useState<SocialMockAnalyticsPlatformFilterId>(platformFromSearch);
  const ownedPlatforms = useMemo(
    () => getSocialMockPlatformIdsForAccount(accountKind),
    [accountKind],
  );
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

  useEffect(() => {
    setPeriod(periodFromSearch);
  }, [periodFromSearch]);

  useEffect(() => {
    setPlatform(platformFromSearch);
  }, [platformFromSearch]);

  useEffect(() => {
    if (platform !== "all" && !ownedPlatforms.includes(platform)) {
      setPlatform("all");
    }
  }, [ownedPlatforms, platform]);

  const metrics = useMemo(
    () => getSocialMockAnalyticsMetrics(period, platform),
    [period, platform],
  );

  const selection = useMemo(
    () =>
      getSocialMockAnalyticsSelection(selectedId, { period, platform }) ??
      getSocialMockAnalyticsSelection("impressions", { period, platform })!,
    [selectedId, period, platform],
  );

  const topPosts = SOCIAL_MOCK_ANALYTICS_TOP_POSTS.filter((post) => {
    if (!ownedPlatforms.includes(post.platform)) return false;
    if (platform !== "all" && post.platform !== platform) return false;
    return true;
  });

  const platformRows = SOCIAL_MOCK_ANALYTICS_PLATFORM_BREAKDOWN.filter((row) => {
    if (!ownedPlatforms.includes(row.id)) return false;
    if (platform !== "all" && row.id !== platform) return false;
    return true;
  });

  const periodLabel = period === "7d" ? "Last 7 days" : "Last 30 days";
  const scopeLabel =
    platform === "all" ? accountAnalytics.subtitle : platformLabel(platform);

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
                No posts in this filter yet.
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
