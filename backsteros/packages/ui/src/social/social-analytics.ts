import type { SocialAnalyticsSnapshot } from "@backsteros/contracts";

export type SocialAnalyticsClient = {
  get: (input: {
    accountKind: "personal" | "business";
    period: "7d" | "30d";
    platform: "all" | "linkedin";
  }) => Promise<SocialAnalyticsSnapshot>;
};

export type {
  SocialAnalyticsSnapshot,
  SocialAnalyticsMetric,
  SocialAnalyticsPoint,
  SocialAnalyticsTopPost,
  SocialAnalyticsPlatformBreakdown,
} from "@backsteros/contracts";
