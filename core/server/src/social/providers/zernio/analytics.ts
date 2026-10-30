/**
 * Network Analytics snapshot for LinkedIn (Zernio daily metrics + post stats).
 */

import { and, eq, isNull } from "drizzle-orm";

import type {
  SocialAnalyticsMetric,
  SocialAnalyticsPlatformBreakdown,
  SocialAnalyticsPoint,
  SocialAnalyticsQuery,
  SocialAnalyticsSnapshot,
  SocialAnalyticsTopPost,
} from "@backsteros/contracts";

import { db } from "../../../db/index.js";
import { socialAccounts } from "../../../db/schema.js";
import { ZernioApiError, ZernioClient } from "./client.js";
import { getZernioCredentials } from "./settings.js";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function storedPlatformForAnalytics(
  accountKind: SocialAnalyticsQuery["accountKind"],
): string {
  return accountKind === "business" ? "linkedin_org" : "linkedin_personal";
}

function stripZernioAccountPrefix(id: string): string {
  return id.startsWith("zernio-account:")
    ? id.slice("zernio-account:".length)
    : id;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function numberOrZero(value: unknown): number {
  return asNumber(value) ?? 0;
}

/** Inclusive UTC day keys (YYYY-MM-DD) for the selected period ending today. */
export function analyticsDateKeys(period: "7d" | "30d", now = new Date()): string[] {
  const days = period === "7d" ? 7 : 30;
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

export function formatAnalyticsCount(value: number): string {
  const n = Math.max(0, Math.round(value));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function formatAnalyticsPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function deltaFromSeries(values: readonly number[]): {
  deltaLabel: string;
  delta: "up" | "down" | "flat";
} {
  if (values.length < 2) return { deltaLabel: "0", delta: "flat" };
  const mid = Math.floor(values.length / 2);
  const first = values.slice(0, mid).reduce((a, b) => a + b, 0);
  const second = values.slice(mid).reduce((a, b) => a + b, 0);
  if (first === 0 && second === 0) return { deltaLabel: "0", delta: "flat" };
  if (first === 0) {
    return { deltaLabel: "+100%", delta: second > 0 ? "up" : "flat" };
  }
  const pct = ((second - first) / Math.abs(first)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (Math.abs(rounded) < 0.05) return { deltaLabel: "0%", delta: "flat" };
  return {
    deltaLabel: `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`,
    delta: rounded > 0 ? "up" : "down",
  };
}

function pointForDay(
  dateKey: string,
  value: number,
  period: "7d" | "30d",
): SocialAnalyticsPoint {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const weekday = WEEKDAYS[date.getUTCDay() === 0 ? 6 : date.getUTCDay() - 1]!;
  return {
    date: dateKey,
    label: period === "7d" ? weekday : String(date.getUTCDate()),
    value,
  };
}

function emptySeries(
  keys: readonly string[],
  period: "7d" | "30d",
  fill = 0,
): SocialAnalyticsPoint[] {
  return keys.map((key) => pointForDay(key, fill, period));
}

type DailyBucket = {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  followers: number | null;
};

function emptyBucket(): DailyBucket {
  return {
    impressions: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    clicks: 0,
    followers: null,
  };
}

function engagementRate(bucket: {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}): number {
  if (bucket.impressions <= 0) return 0;
  const eng =
    bucket.likes + bucket.comments + bucket.shares + bucket.saves;
  return (eng / bucket.impressions) * 100;
}

function parseDailyMetrics(
  payload: unknown,
  keys: readonly string[],
): Map<string, DailyBucket> {
  const map = new Map<string, DailyBucket>();
  for (const key of keys) map.set(key, emptyBucket());

  const root = asRecord(payload) ?? {};
  const rows = Array.isArray(root.dailyData)
    ? root.dailyData
    : Array.isArray(root.data)
      ? root.data
      : Array.isArray(payload)
        ? payload
        : [];

  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const dateRaw =
      asString(r.date) ?? asString(r.day) ?? asString(r.capturedAt) ?? "";
    const dateKey = dateRaw.slice(0, 10);
    if (!map.has(dateKey)) continue;
    const metrics = asRecord(r.metrics) ?? r;
    const bucket = map.get(dateKey)!;
    bucket.impressions += numberOrZero(metrics.impressions);
    bucket.reach += numberOrZero(metrics.reach);
    bucket.likes += numberOrZero(metrics.likes);
    bucket.comments += numberOrZero(metrics.comments);
    bucket.shares += numberOrZero(metrics.shares);
    bucket.saves += numberOrZero(metrics.saves);
    bucket.clicks += numberOrZero(metrics.clicks);
    const followers = asNumber(metrics.followers ?? metrics.followerCount);
    if (followers != null) bucket.followers = followers;
  }
  return map;
}

function applyFollowerStats(
  map: Map<string, DailyBucket>,
  payload: unknown,
  accountExternalId: string,
): void {
  const root = asRecord(payload) ?? {};
  const statsByAccount = asRecord(root.stats) ?? {};
  const rows = Array.isArray(statsByAccount[accountExternalId])
    ? (statsByAccount[accountExternalId] as unknown[])
    : Array.isArray(root.stats)
      ? (root.stats as unknown[])
      : [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const dateRaw =
      asString(r.date) ?? asString(r.day) ?? asString(r.capturedAt) ?? "";
    const dateKey = dateRaw.slice(0, 10);
    const bucket = map.get(dateKey);
    if (!bucket) continue;
    const followers = asNumber(
      r.followers ?? r.followerCount ?? r.currentFollowers,
    );
    if (followers != null) bucket.followers = followers;
  }
}

type TopPostRaw = {
  id: string;
  postId: string;
  title: string;
  impressions: number;
  engagement: number;
  engagementRate: number;
};

function parseAnalyticsPosts(payload: unknown): TopPostRaw[] {
  const root = asRecord(payload) ?? {};
  const rows = Array.isArray(root.posts)
    ? root.posts
    : Array.isArray(root.data)
      ? root.data
      : [];
  const out: TopPostRaw[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const id = asString(r.id) ?? asString(r._id) ?? asString(r.postId);
    if (!id) continue;
    const metrics = asRecord(r.metrics) ?? asRecord(r.analytics) ?? r;
    const impressions = numberOrZero(metrics.impressions);
    const likes = numberOrZero(metrics.likes);
    const comments = numberOrZero(metrics.comments);
    const shares = numberOrZero(metrics.shares);
    const saves = numberOrZero(metrics.saves);
    const engagement = likes + comments + shares + saves;
    const title =
      asString(r.content) ??
      asString(r.text) ??
      asString(r.title) ??
      "LinkedIn post";
    out.push({
      id,
      postId: id.startsWith("zernio-") ? id : `zernio-post:${id}`,
      title: title.slice(0, 120),
      impressions,
      engagement,
      engagementRate: engagementRate({
        impressions,
        likes,
        comments,
        shares,
        saves,
      }),
    });
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, 8);
}

async function enrichTopPostsFromAuthored(
  client: ZernioClient,
  accountExternalId: string,
): Promise<TopPostRaw[]> {
  let authored: Awaited<ReturnType<ZernioClient["listZernioPosts"]>> = [];
  try {
    authored = await client.listZernioPosts({
      accountId: accountExternalId,
      status: "published",
      limit: 15,
    });
  } catch {
    return [];
  }

  const out: TopPostRaw[] = [];
  for (const post of authored) {
    const status = (post.status ?? "").toLowerCase();
    if (status && status !== "published" && status !== "success") continue;
    const urn = post.platformPostId?.trim() || null;
    let impressions = 0;
    let likes = 0;
    let comments = 0;
    let shares = 0;
    let saves = 0;
    if (urn?.startsWith("urn:li:")) {
      try {
        const stats = await client.getLinkedInPostAnalytics(
          accountExternalId,
          urn,
        );
        impressions = stats.impressions;
        likes = stats.likes;
        comments = stats.comments;
        shares = stats.shares;
        saves = stats.saves;
      } catch {
        // keep zeros
      }
    }
    const title =
      (post.message ?? "LinkedIn post").trim().slice(0, 120) || "LinkedIn post";
    const id = post.id;
    out.push({
      id,
      postId: id.startsWith("zernio-") ? id : `zernio-post:${id}`,
      title,
      impressions,
      engagement: likes + comments + shares + saves,
      engagementRate: engagementRate({
        impressions,
        likes,
        comments,
        shares,
        saves,
      }),
    });
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, 8);
}

function buildMetrics(
  period: "7d" | "30d",
  keys: readonly string[],
  buckets: Map<string, DailyBucket>,
  currentFollowers: number,
): SocialAnalyticsMetric[] {
  const impressions = keys.map((k) => buckets.get(k)?.impressions ?? 0);
  const reach = keys.map((k) => buckets.get(k)?.reach ?? 0);
  const engagement = keys.map((k) => {
    const b = buckets.get(k) ?? emptyBucket();
    return engagementRate(b);
  });
  let lastFollowers = currentFollowers;
  const followers: number[] = keys.map((k) => {
    const fromBucket = buckets.get(k)?.followers;
    if (fromBucket != null) lastFollowers = fromBucket;
    return lastFollowers;
  });
  // If no history, flat-line current count so the card isn't empty noise.
  let followerSeries = followers;
  if (
    currentFollowers > 0 &&
    followers.reduce((sum, value) => sum + value, 0) === 0
  ) {
    followerSeries = keys.map(() => currentFollowers);
  }

  const impressionTotal = impressions.reduce((a, b) => a + b, 0);
  const reachTotal = reach.reduce((a, b) => a + b, 0);
  const engagementEnd = engagement[engagement.length - 1] ?? 0;
  const followerEnd =
    followerSeries[followerSeries.length - 1] ?? currentFollowers;
  const followerStart = followerSeries[0] ?? followerEnd;
  const followerDelta = followerEnd - followerStart;
  const impDelta = deltaFromSeries(impressions);
  const engDelta = deltaFromSeries(engagement);
  const reachDelta = deltaFromSeries(reach);

  return [
    {
      id: "impressions",
      label: "Impressions",
      valueLabel: formatAnalyticsCount(impressionTotal),
      deltaLabel: impDelta.deltaLabel,
      delta: impDelta.delta,
      valueFormat: "count",
      series: keys.map((key, i) =>
        pointForDay(key, impressions[i] ?? 0, period),
      ),
    },
    {
      id: "engagement",
      label: "Engagement",
      valueLabel: formatAnalyticsPercent(engagementEnd),
      deltaLabel: engDelta.deltaLabel,
      delta: engDelta.delta,
      valueFormat: "percent",
      series: keys.map((key, i) =>
        pointForDay(key, engagement[i] ?? 0, period),
      ),
    },
    {
      id: "reach",
      label: "Reach",
      valueLabel: formatAnalyticsCount(reachTotal),
      deltaLabel: reachDelta.deltaLabel,
      delta: reachDelta.delta,
      valueFormat: "count",
      series: keys.map((key, i) => pointForDay(key, reach[i] ?? 0, period)),
    },
    {
      id: "followers",
      label: "Followers",
      valueLabel: followerEnd.toLocaleString("en-US"),
      deltaLabel: `${followerDelta >= 0 ? "+" : ""}${followerDelta}`,
      delta:
        followerDelta > 0 ? "up" : followerDelta < 0 ? "down" : "flat",
      valueFormat: "count",
      series: keys.map((key, i) =>
        pointForDay(key, followerSeries[i] ?? followerEnd, period),
      ),
    },
  ];
}

function buildPlatformBreakdown(
  metrics: readonly SocialAnalyticsMetric[],
  currentFollowers: number,
): SocialAnalyticsPlatformBreakdown[] {
  const impressions =
    metrics.find((m) => m.id === "impressions")?.valueLabel ?? "0";
  const engagement =
    metrics.find((m) => m.id === "engagement")?.valueLabel ?? "0%";
  return [
    {
      id: "linkedin",
      label: "LinkedIn",
      impressionsLabel: impressions,
      engagementLabel: engagement,
      followersLabel: currentFollowers.toLocaleString("en-US"),
      sharePercent: 100,
    },
  ];
}

function buildTopPosts(raw: readonly TopPostRaw[]): SocialAnalyticsTopPost[] {
  return raw.map((post) => ({
    id: post.id,
    postId: post.postId,
    title: post.title,
    platform: "linkedin" as const,
    impressionsLabel: formatAnalyticsCount(post.impressions),
    engagementLabel: formatAnalyticsCount(post.engagement),
    engagementRateLabel: formatAnalyticsPercent(post.engagementRate),
  }));
}

function buildTopPostSeries(
  period: "7d" | "30d",
  keys: readonly string[],
  top: TopPostRaw | null,
): SocialAnalyticsPoint[] {
  if (!top || top.engagement <= 0) return emptySeries(keys, period, 0);
  // Zernio rarely returns per-day post series — synthesize a rising curve to
  // the known total so the Top post chart still has shape.
  const total = top.engagement;
  return keys.map((key, index) => {
    const t = (index + 1) / keys.length;
    const value = Math.round(total * t * t);
    return pointForDay(key, value, period);
  });
}

/** Live LinkedIn analytics for Network Analytics. */
export async function getSocialAnalytics(
  workspaceId: string,
  query: SocialAnalyticsQuery,
): Promise<SocialAnalyticsSnapshot> {
  const creds = await getZernioCredentials(workspaceId);
  if (!creds.apiKey) {
    throw new ZernioApiError(
      400,
      "",
      "Zernio API key is not configured — add it in Settings → Social.",
    );
  }

  const storedPlatform = storedPlatformForAnalytics(query.accountKind);
  const [account] = await db
    .select({
      id: socialAccounts.id,
      externalId: socialAccounts.externalId,
      followersCount: socialAccounts.followersCount,
      displayName: socialAccounts.displayName,
      handle: socialAccounts.handle,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.provider, "zernio"),
        eq(socialAccounts.platform, storedPlatform),
        isNull(socialAccounts.deletedAt),
      ),
    )
    .limit(1);

  const keys = analyticsDateKeys(query.period);
  const periodLabel = query.period === "7d" ? "Last 7 days" : "Last 30 days";
  const subtitle =
    query.accountKind === "business"
      ? "Business · LinkedIn"
      : "Personal · LinkedIn";

  if (!account) {
    return {
      source: "live",
      accountKind: query.accountKind,
      period: query.period,
      platform: query.platform,
      subtitle,
      periodLabel,
      hasAnalyticsAccess: false,
      metrics: buildMetrics(query.period, keys, new Map(), 0),
      platformBreakdown: [],
      topPosts: [],
      topPostSeries: emptySeries(keys, query.period),
      topPostTitle: null,
    };
  }

  const client = new ZernioClient({
    apiKey: creds.apiKey,
    rateKey: workspaceId,
  });
  const externalId = stripZernioAccountPrefix(account.externalId || account.id);
  const fromDate = keys[0]!;
  const toDate = keys[keys.length - 1]!;
  const baseQuery: Record<string, string> = {
    accountId: externalId,
    platform: "linkedin",
    fromDate,
    toDate,
  };
  if (creds.profileId) baseQuery.profileId = creds.profileId;

  const [dailyPayload, followerPayload, analyticsPayload] = await Promise.all([
    client.getDailyMetrics(baseQuery).catch(() => ({ dailyData: [] })),
    client
      .getFollowerStats({
        accountIds: externalId,
        fromDate,
        toDate,
        ...(creds.profileId ? { profileId: creds.profileId } : {}),
      })
      .catch(() => ({ stats: {} })),
    client.getAnalytics(baseQuery).catch(() => ({ posts: [] })),
  ]);

  const buckets = parseDailyMetrics(dailyPayload, keys);
  applyFollowerStats(buckets, followerPayload, externalId);

  let topRaw = parseAnalyticsPosts(analyticsPayload);
  if (topRaw.length === 0) {
    topRaw = await enrichTopPostsFromAuthored(client, externalId);
  }

  // When daily metrics are empty but post analytics exist, fold totals into
  // the last day so summary cards aren't all zero.
  const hasDaily = [...buckets.values()].some(
    (b) => b.impressions > 0 || b.reach > 0 || b.likes > 0,
  );
  if (!hasDaily && topRaw.length > 0) {
    const last = buckets.get(toDate) ?? emptyBucket();
    for (const post of topRaw) {
      last.impressions += post.impressions;
      // Approximate reach as impressions when daily reach is missing.
      last.reach += post.impressions;
      last.likes += post.engagement;
    }
    buckets.set(toDate, last);
  }

  const currentFollowers = Math.max(0, account.followersCount ?? 0);
  const followerRoot = asRecord(followerPayload) ?? {};
  const accounts = Array.isArray(followerRoot.accounts)
    ? followerRoot.accounts
    : [];
  for (const row of accounts) {
    const r = asRecord(row);
    if (!r) continue;
    const id = asString(r._id) ?? asString(r.id);
    if (id !== externalId) continue;
    const n = asNumber(r.currentFollowers ?? r.followers);
    if (n != null) {
      // Prefer live follower-stats current count.
      for (const key of keys) {
        const bucket = buckets.get(key)!;
        if (bucket.followers == null) bucket.followers = n;
      }
    }
  }

  const hasAnalyticsAccess =
    asRecord(analyticsPayload)?.hasAnalyticsAccess === true ||
    asRecord(analyticsPayload)?.hasAnalyticsAccess === undefined;

  const metrics = buildMetrics(
    query.period,
    keys,
    buckets,
    currentFollowers,
  );
  const topPosts = buildTopPosts(topRaw);
  const leading = topRaw[0] ?? null;

  return {
    source: "live",
    accountKind: query.accountKind,
    period: query.period,
    platform: query.platform,
    subtitle,
    periodLabel,
    hasAnalyticsAccess: Boolean(hasAnalyticsAccess),
    metrics,
    platformBreakdown: buildPlatformBreakdown(metrics, currentFollowers),
    topPosts,
    topPostSeries: buildTopPostSeries(query.period, keys, leading),
    topPostTitle: leading?.title ?? null,
  };
}
