export type SocialMockPostPlatform =
  | "facebook"
  | "instagram"
  | "x"
  | "linkedin"
  | "dev-null";

/** Personal vs business owned-account bundle in Network Social. */
export type SocialMockAccountKind = "personal" | "business";

export type SocialMockOwnedAccount = {
  id: string;
  kind: SocialMockAccountKind;
  platform: SocialMockPostPlatform;
  handle: string;
  label: string;
};

export type SocialMockPost = {
  id: string;
  authorName: string;
  authorHandle: string;
  /** Live connected-account avatar when the feed comes from Zernio. */
  authorAvatarUrl?: string;
  /** Live connected-account follower count when known. */
  authorFollowersCount?: number;
  /** Public URL on the network (e.g. LinkedIn post) for open-in-browser. */
  permalink?: string;
  authorVerified?: boolean;
  platform: SocialMockPostPlatform;
  /**
   * Planned multi-target posts — detail/draft badges list every network.
   * Falls back to `[platform]` when omitted.
   */
  targetPlatforms?: readonly SocialMockPostPlatform[];
  /** Which owned-account bundle this inbox item belongs to. */
  accountKind: SocialMockAccountKind;
  body: string;
  /** Optional attached photo (common on Facebook posts). */
  imageUrl?: string;
  imageAlt?: string;
  createdAt: string;
  replyCount: number;
  repostCount: number;
  likeCount: number;
  /** LinkedIn save count when known from analytics. */
  saveCount?: number;
  feed: "for-you" | "following" | "both";
};

/** LinkedIn feed home — used when a post has no permalink yet. */
export const SOCIAL_LINKEDIN_FEED_FALLBACK_URL =
  "https://www.linkedin.com/feed/";

/**
 * Where to leave a reply on the network itself (apps can’t post LinkedIn
 * comments). Prefer the post permalink; LinkedIn falls back to the feed.
 */
export function getSocialPostExternalReplyUrl(
  post: Pick<SocialMockPost, "permalink" | "platform">,
): string | null {
  const permalink = post.permalink?.trim();
  if (permalink) return permalink;
  if (post.platform === "linkedin") return SOCIAL_LINKEDIN_FEED_FALLBACK_URL;
  return null;
}

export type SocialMockTrendingTopic = {
  id: string;
  category: string;
  title: string;
  postCountLabel: string;
};

export type SocialMockFollowSuggestion = {
  id: string;
  name: string;
  handle: string;
  bio: string;
};

export type SocialMockAnalyticsPoint = {
  /** Stable x key for the chart (ISO date). */
  date: string;
  /** Short axis / tooltip label (e.g. "Mon"). */
  label: string;
  value: number;
};

export type SocialMockAnalyticsMetricId =
  | "impressions"
  | "engagement"
  | "reach"
  | "followers";

export type SocialMockAnalyticsMetric = {
  id: SocialMockAnalyticsMetricId;
  label: string;
  valueLabel: string;
  /** e.g. "+12.4%" — positive / negative / flat for styling. */
  deltaLabel: string;
  delta: "up" | "down" | "flat";
  /** How to format chart Y values. */
  valueFormat: "count" | "percent";
  series: readonly SocialMockAnalyticsPoint[];
};

export type SocialMockAnalyticsSelectionId =
  | SocialMockAnalyticsMetricId
  | "top-post";

export type SocialMockAnalyticsSnapshot = {
  periodLabel: string;
  subtitle: string;
  metrics: readonly SocialMockAnalyticsMetric[];
  topPostTitle: string;
  topPostPlatform: SocialMockPostPlatform;
  topPostEngagementLabel: string;
  topPostSeries: readonly SocialMockAnalyticsPoint[];
};

export type SocialMockProfile = {
  firstName: string;
  lastName: string;
  handle: string;
  verified?: boolean;
  bio: string;
  location: string;
  websiteLabel: string;
  websiteUrl: string;
  joinedLabel: string;
  followingCount: number;
  followersCount: number;
  avatarUrl: string;
  coverUrl: string;
  /** Post ids from SOCIAL_MOCK_POSTS shown on the profile Posts tab. */
  postIds: readonly string[];
};

export function socialMockProfileDisplayName(
  profile: Pick<SocialMockProfile, "firstName" | "lastName">,
): string {
  return `${profile.firstName} ${profile.lastName}`.trim();
}

export type SocialMockReply = {
  id: string;
  postId: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl?: string;
  authorVerified?: boolean;
  body: string;
  createdAt: string;
  likeCount: number;
};

const now = Date.now();

/** Connected accounts per Personal / Business bundle. */
export const SOCIAL_MOCK_OWNED_ACCOUNTS: readonly SocialMockOwnedAccount[] = [
  {
    id: "personal-facebook",
    kind: "personal",
    platform: "facebook",
    handle: "remon.dv",
    label: "Remon de Vries",
  },
  {
    id: "personal-instagram",
    kind: "personal",
    platform: "instagram",
    handle: "remon",
    label: "Remon de Vries",
  },
  {
    id: "personal-x",
    kind: "personal",
    platform: "x",
    handle: "remon",
    label: "Remon de Vries",
  },
  {
    id: "personal-linkedin",
    kind: "personal",
    platform: "linkedin",
    handle: "remondevries",
    label: "Remon de Vries",
  },
  {
    id: "personal-dev-null",
    kind: "personal",
    platform: "dev-null",
    handle: "remon",
    label: "Remon de Vries",
  },
  {
    id: "business-facebook",
    kind: "business",
    platform: "facebook",
    handle: "backsteros",
    label: "BacksterOS",
  },
  {
    id: "business-instagram",
    kind: "business",
    platform: "instagram",
    handle: "backsteros.app",
    label: "BacksterOS",
  },
  {
    id: "business-x",
    kind: "business",
    platform: "x",
    handle: "backsteros",
    label: "BacksterOS",
  },
  {
    id: "business-linkedin",
    kind: "business",
    platform: "linkedin",
    handle: "company/backsteros",
    label: "BacksterOS",
  },
  {
    id: "business-dev-null",
    kind: "business",
    platform: "dev-null",
    handle: "backsteros",
    label: "BacksterOS",
  },
];

/**
 * Business inbox items — company LinkedIn + brand Facebook / X posts.
 * Personal LinkedIn keeps post-5 and post-11.
 */
const BUSINESS_FEED_POST_IDS = new Set([
  "post-3",
  "post-8",
  "post-9",
  "post-14",
  "post-15",
]);

type SocialMockPostSeed = Omit<SocialMockPost, "accountKind">;

const SOCIAL_MOCK_POST_SEEDS: readonly SocialMockPostSeed[] = [
  {
    id: "post-1",
    authorName: "Sophia Reeves",
    authorHandle: "sophiareeves",
    authorVerified: true,
    platform: "instagram",
    body: "Golden hour at the Grand Canyon never gets old. Spent three days hiking the Bright Angel Trail — every turn was a new painting. Highly recommend going in spring before the crowds.\n\n#grandcanyon #goldenhour #hiking #travelgram #naturephotography #brightangeltrail #wanderlust #landscape",
    imageUrl:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1080&h=1080&fit=crop&q=80",
    imageAlt: "Grand Canyon at golden hour",
    createdAt: new Date(now - 2 * 60_000).toISOString(),
    replyCount: 12,
    repostCount: 48,
    likeCount: 326,
    feed: "both",
  },
  {
    id: "post-2",
    authorName: "Rahim Chowdhury",
    authorHandle: "rahimdev",
    platform: "x",
    body: "Hot take: the best thing you can do for your developer productivity is close all Slack notifications before 10am. I've shipped more in the last month than the previous three combined. Context switching is silently killing our best work.",
    createdAt: new Date(now - 18 * 60_000).toISOString(),
    replyCount: 84,
    repostCount: 210,
    likeCount: 1402,
    feed: "for-you",
  },
  {
    id: "post-3",
    authorName: "Maya Chen",
    authorHandle: "mayauxlabs",
    authorVerified: true,
    platform: "linkedin",
    body: "How do you handle design handoff when devs don't use Figma? We tried Zeplin, Storybook, and annotated screenshots — curious what actually sticks for your team.",
    createdAt: new Date(now - 45 * 60_000).toISOString(),
    replyCount: 56,
    repostCount: 19,
    likeCount: 241,
    feed: "both",
  },
  {
    id: "post-4",
    authorName: "Leo Nakamura",
    authorHandle: "leonakamura",
    platform: "facebook",
    body: "I built a full SaaS in 72 hours using only open-source tools. Here's the complete breakdown — from idea to production deploy. Thread incoming.",
    imageUrl:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80",
    imageAlt: "Laptop on a desk showing charts and analytics",
    createdAt: new Date(now - 60 * 60_000).toISOString(),
    replyCount: 33,
    repostCount: 97,
    likeCount: 812,
    feed: "following",
  },
  {
    id: "post-5",
    authorName: "James Osei",
    authorHandle: "jamesosei",
    platform: "linkedin",
    body: "We export everything to Zeplin with annotated specs. Devs love it because they don't need a Figma account — and design still owns the source of truth.",
    createdAt: new Date(now - 2 * 60 * 60_000).toISOString(),
    replyCount: 7,
    repostCount: 4,
    likeCount: 63,
    feed: "for-you",
  },
  {
    id: "post-6",
    authorName: "Aisha Patel",
    authorHandle: "aishapatel",
    authorVerified: true,
    platform: "x",
    body: "Storybook is our source of truth. I work directly in the component library so handoff is basically instant — no middle format to go stale.",
    createdAt: new Date(now - 3 * 60 * 60_000).toISOString(),
    replyCount: 21,
    repostCount: 38,
    likeCount: 290,
    feed: "following",
  },
  {
    id: "post-7",
    authorName: "Nina Volkov",
    authorHandle: "ninav",
    authorVerified: true,
    platform: "instagram",
    body: "Studio morning light hits different. New moodboard for the Q2 brand refresh — warmer neutrals, sharper type, fewer gradients. Can't wait to share the system.\n\n#branddesign #moodboard #studioday #visualidentity #designsystem #typography #brandrefresh #creative",
    imageUrl:
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&h=1080&fit=crop&q=80",
    imageAlt: "Abstract brand moodboard with warm neutrals",
    createdAt: new Date(now - 4 * 60 * 60_000).toISOString(),
    replyCount: 41,
    repostCount: 76,
    likeCount: 1184,
    feed: "both",
  },
  {
    id: "post-8",
    authorName: "Omar Hassan",
    authorHandle: "omarbuilds",
    platform: "x",
    body: "Shipping advice I wish I'd heard earlier: charge before you build the dashboard. I spent 3 months polishing charts for a product with zero paying users. Never again.",
    createdAt: new Date(now - 5 * 60 * 60_000).toISOString(),
    replyCount: 156,
    repostCount: 402,
    likeCount: 3201,
    feed: "for-you",
  },
  {
    id: "post-9",
    authorName: "Elena Brooks",
    authorHandle: "elenabrooks",
    authorVerified: true,
    platform: "linkedin",
    body: "Remote teams don't fail because of timezone math — they fail because decisions live in Slack threads nobody owns. We moved every decision to a short written RFC. Velocity went up, drama went down.",
    createdAt: new Date(now - 6 * 60 * 60_000).toISOString(),
    replyCount: 98,
    repostCount: 145,
    likeCount: 892,
    feed: "both",
  },
  {
    id: "post-10",
    authorName: "Tomás Rivera",
    authorHandle: "tomasrivera",
    platform: "facebook",
    body: "Weekend project: rebuilt our family photo archive with local AI tagging. Searching “beach 2019 dog” actually works now. Feels like magic when the stack is boring and local.",
    imageUrl:
      "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1200&q=80",
    imageAlt: "Family walking together on a beach at sunset",
    createdAt: new Date(now - 7 * 60 * 60_000).toISOString(),
    replyCount: 28,
    repostCount: 14,
    likeCount: 207,
    feed: "following",
  },
  {
    id: "post-11",
    authorName: "Priya Nair",
    authorHandle: "priyanair",
    authorVerified: true,
    platform: "linkedin",
    body: "Hiring senior product engineers who care as much about empty states as they do about APIs. If you've shipped something you're proud of (and can talk about the tradeoffs), I'd love to chat.",
    createdAt: new Date(now - 9 * 60 * 60_000).toISOString(),
    replyCount: 64,
    repostCount: 31,
    likeCount: 418,
    feed: "for-you",
  },
  {
    id: "post-12",
    authorName: "Chris Lang",
    authorHandle: "chrislang",
    platform: "instagram",
    body: "First pour-over of the week + a blank notebook. No phone for the first hour. Still the highest-ROI habit I've kept this year.\n\n#morningroutine #coffee #pourover #slowmorning #mindfulness #notebook #habits #quiet",
    imageUrl:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1080&h=1080&fit=crop&q=80",
    imageAlt: "Pour-over coffee and a notebook on a table",
    createdAt: new Date(now - 11 * 60 * 60_000).toISOString(),
    replyCount: 19,
    repostCount: 52,
    likeCount: 743,
    feed: "following",
  },
  {
    id: "post-13",
    authorName: "Sofia Mendes",
    authorHandle: "sofiamendes",
    platform: "x",
    body: "Unpopular opinion: most “AI features” are just search with extra steps. The useful ones change a workflow end-to-end — not paste a paragraph into a sidebar.",
    createdAt: new Date(now - 14 * 60 * 60_000).toISOString(),
    replyCount: 312,
    repostCount: 891,
    likeCount: 5402,
    feed: "for-you",
  },
  {
    id: "post-14",
    authorName: "Daniel Okonkwo",
    authorHandle: "danieloko",
    authorVerified: true,
    platform: "facebook",
    body: "Community meetup recap: 40 builders, zero pitch decks, one whiteboard covered in messy arrows. Best night of the month. Next one is open — DM if you want in.",
    imageUrl:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80",
    imageAlt: "People networking at a community meetup",
    createdAt: new Date(now - 18 * 60 * 60_000).toISOString(),
    replyCount: 47,
    repostCount: 22,
    likeCount: 356,
    feed: "both",
  },
  {
    id: "post-15",
    authorName: "Hannah Berg",
    authorHandle: "hannahberg",
    platform: "linkedin",
    body: "Customer research tip: stop asking people what they want. Ask them to walk you through the last time they struggled. The workaround they invented is your roadmap.",
    createdAt: new Date(now - 22 * 60 * 60_000).toISOString(),
    replyCount: 73,
    repostCount: 188,
    likeCount: 1260,
    feed: "following",
  },
  {
    id: "post-16",
    authorName: "Kai Nakamura",
    authorHandle: "kainakamura",
    platform: "instagram",
    body: "Tokyo night walk — neon reflections on wet pavement. Shot on the new compact camera; still learning, still obsessed.\n\n#tokyo #japan #streetphotography #neon #nightwalk #citylights #compactcamera #travel",
    imageUrl:
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1080&h=1080&fit=crop&q=80",
    imageAlt: "Tokyo street neon lights at night",
    createdAt: new Date(now - 26 * 60 * 60_000).toISOString(),
    replyCount: 55,
    repostCount: 120,
    likeCount: 2104,
    feed: "for-you",
  },
  {
    id: "post-17",
    authorName: "Jules Ortega",
    authorHandle: "julesortega",
    platform: "dev-null",
    body: "Wrote three paragraphs, hit post, watched them vanish into /dev/null. Sometimes the best draft is the one nobody sees.",
    createdAt: new Date(now - 30 * 60 * 60_000).toISOString(),
    replyCount: 9,
    repostCount: 14,
    likeCount: 128,
    feed: "both",
  },
];

export const SOCIAL_MOCK_POSTS: readonly SocialMockPost[] =
  SOCIAL_MOCK_POST_SEEDS.map((post) => ({
    ...post,
    accountKind: BUSINESS_FEED_POST_IDS.has(post.id) ? "business" : "personal",
  }));

export const SOCIAL_MOCK_TRENDING: readonly SocialMockTrendingTopic[] = [
  {
    id: "trend-1",
    category: "Technology · Trending",
    title: "Open source SaaS",
    postCountLabel: "14.2K posts",
  },
  {
    id: "trend-2",
    category: "Design · Trending",
    title: "Design handoff",
    postCountLabel: "8,412 posts",
  },
  {
    id: "trend-3",
    category: "Trending in Netherlands",
    title: "Deep work mornings",
    postCountLabel: "3,104 posts",
  },
  {
    id: "trend-4",
    category: "Business · Trending",
    title: "Context switching",
    postCountLabel: "21.6K posts",
  },
];

export type SocialMockAnalyticsPeriodId = "7d" | "30d";

export type SocialMockAnalyticsPlatformFilterId =
  | "all"
  | SocialMockPostPlatform;

export type SocialMockAnalyticsPlatformBreakdown = {
  id: SocialMockPostPlatform;
  label: string;
  impressionsLabel: string;
  engagementLabel: string;
  followersLabel: string;
  sharePercent: number;
};

export type SocialMockAnalyticsTopPost = {
  id: string;
  postId: string;
  title: string;
  platform: SocialMockPostPlatform;
  impressionsLabel: string;
  engagementLabel: string;
  engagementRateLabel: string;
};

function mockDaySeries(
  values: readonly number[],
  labelMode: "weekday" | "day",
): SocialMockAnalyticsPoint[] {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (values.length - 1));
  return values.map((value, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const weekday = weekdays[date.getDay() === 0 ? 6 : date.getDay() - 1]!;
    return {
      date: date.toISOString().slice(0, 10),
      label:
        labelMode === "weekday"
          ? weekday
          : String(date.getDate()),
      value,
    };
  });
}

const IMPRESSIONS_7D = [5200, 6100, 5800, 7200, 8100, 7900, 7900] as const;
const ENGAGEMENT_7D = [3.1, 3.2, 3.4, 3.5, 3.7, 3.6, 3.8] as const;
const REACH_7D = [3400, 3600, 3100, 2900, 2800, 2700, 2600] as const;
const FOLLOWERS_7D = [1786, 1791, 1798, 1804, 1810, 1815, 1820] as const;
const TOP_POST_7D = [420, 890, 1400, 2100, 3100, 4300, 5400] as const;

const IMPRESSIONS_30D = [
  4100, 4300, 3900, 4500, 4700, 5100, 4900, 5200, 5400, 5000, 4800, 5300, 5600,
  5800, 5500, 5200, 6100, 5800, 7200, 8100, 7900, 7600, 7400, 7800, 8200, 8000,
  7900, 8100, 8300, 8500,
] as const;
const ENGAGEMENT_30D = [
  2.8, 2.9, 2.9, 3.0, 3.0, 3.1, 3.0, 3.1, 3.2, 3.1, 3.2, 3.3, 3.3, 3.4, 3.3,
  3.1, 3.2, 3.4, 3.5, 3.7, 3.6, 3.5, 3.6, 3.7, 3.8, 3.7, 3.8, 3.8, 3.9, 3.8,
] as const;
const REACH_30D = [
  2900, 3000, 2800, 3100, 3200, 3300, 3100, 3400, 3500, 3200, 3000, 3300, 3400,
  3500, 3300, 3400, 3600, 3100, 2900, 2800, 2700, 2650, 2600, 2700, 2800, 2750,
  2700, 2680, 2650, 2600,
] as const;
const FOLLOWERS_30D = [
  1748, 1750, 1752, 1755, 1758, 1761, 1764, 1766, 1769, 1771, 1773, 1775, 1778,
  1780, 1782, 1784, 1786, 1791, 1798, 1804, 1810, 1812, 1813, 1815, 1816, 1817,
  1818, 1819, 1820, 1820,
] as const;
const TOP_POST_30D = [
  40, 80, 120, 180, 240, 310, 380, 450, 520, 600, 690, 780, 880, 990, 1100,
  1240, 1400, 1580, 1780, 2000, 2250, 2550, 2900, 3300, 3750, 4200, 4600, 5000,
  5200, 5400,
] as const;

function scaleSeries(
  values: readonly number[],
  factor: number,
  round = true,
): number[] {
  return values.map((value) => {
    const next = value * factor;
    return round ? Math.round(next) : Number(next.toFixed(1));
  });
}

function buildMetrics(
  period: SocialMockAnalyticsPeriodId,
  platform: SocialMockAnalyticsPlatformFilterId,
): SocialMockAnalyticsMetric[] {
  const factor =
    platform === "all"
      ? 1
      : platform === "x"
        ? 0.42
        : platform === "linkedin"
          ? 0.28
          : platform === "instagram"
            ? 0.18
            : 0.12;
  const is7d = period === "7d";
  const labelMode = is7d ? "weekday" : "day";
  const impressions = scaleSeries(
    is7d ? IMPRESSIONS_7D : IMPRESSIONS_30D,
    factor,
  );
  const engagement = scaleSeries(
    is7d ? ENGAGEMENT_7D : ENGAGEMENT_30D,
    platform === "all" ? 1 : platform === "linkedin" ? 1.15 : 0.92,
    false,
  );
  const reach = scaleSeries(is7d ? REACH_7D : REACH_30D, factor);
  const followersBase = is7d ? FOLLOWERS_7D : FOLLOWERS_30D;
  const followers =
    platform === "all"
      ? [...followersBase]
      : scaleSeries(
          followersBase.map((value) => value - 1700),
          factor,
        ).map((value) => 400 + value);

  const impressionTotal = impressions.reduce((sum, value) => sum + value, 0);
  const reachTotal = reach.reduce((sum, value) => sum + value, 0);
  const followerEnd = followers[followers.length - 1] ?? 0;
  const followerStart = followers[0] ?? 0;
  const followerDelta = followerEnd - followerStart;
  const engagementEnd = engagement[engagement.length - 1] ?? 0;

  return [
    {
      id: "impressions",
      label: "Impressions",
      valueLabel:
        impressionTotal >= 1000
          ? `${(impressionTotal / 1000).toFixed(1)}K`
          : String(impressionTotal),
      deltaLabel: period === "7d" ? "+12.4%" : "+18.2%",
      delta: "up",
      valueFormat: "count",
      series: mockDaySeries(impressions, labelMode),
    },
    {
      id: "engagement",
      label: "Engagement",
      valueLabel: `${engagementEnd.toFixed(1)}%`,
      deltaLabel: period === "7d" ? "+0.6%" : "+0.9%",
      delta: "up",
      valueFormat: "percent",
      series: mockDaySeries(engagement, labelMode),
    },
    {
      id: "reach",
      label: "Reach",
      valueLabel:
        reachTotal >= 1000
          ? `${(reachTotal / 1000).toFixed(1)}K`
          : String(reachTotal),
      deltaLabel: period === "7d" ? "-2.1%" : "-4.6%",
      delta: "down",
      valueFormat: "count",
      series: mockDaySeries(reach, labelMode),
    },
    {
      id: "followers",
      label: "Followers",
      valueLabel: followerEnd.toLocaleString(),
      deltaLabel: `${followerDelta >= 0 ? "+" : ""}${followerDelta}`,
      delta: followerDelta >= 0 ? "up" : "down",
      valueFormat: "count",
      series: mockDaySeries(followers, labelMode),
    },
  ];
}

/** Static Zernio-style progress metrics for the Discover rail / Analytics page (personal). */
export const SOCIAL_MOCK_ANALYTICS: SocialMockAnalyticsSnapshot = {
  periodLabel: "Last 7 days",
  subtitle: "Personal accounts",
  metrics: buildMetrics("7d", "all"),
  topPostTitle: "Hot take: close Slack before 10am",
  topPostPlatform: "x",
  topPostEngagementLabel: "5.4K engagements",
  topPostSeries: mockDaySeries(TOP_POST_7D, "weekday"),
};

export const SOCIAL_MOCK_ANALYTICS_PLATFORM_BREAKDOWN: readonly SocialMockAnalyticsPlatformBreakdown[] =
  [
    {
      id: "x",
      label: "Twitter/X",
      impressionsLabel: "20.1K",
      engagementLabel: "4.2%",
      followersLabel: "812",
      sharePercent: 42,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      impressionsLabel: "13.6K",
      engagementLabel: "5.1%",
      followersLabel: "486",
      sharePercent: 28,
    },
    {
      id: "instagram",
      label: "Instagram",
      impressionsLabel: "8.8K",
      engagementLabel: "3.4%",
      followersLabel: "312",
      sharePercent: 18,
    },
    {
      id: "facebook",
      label: "Facebook",
      impressionsLabel: "5.7K",
      engagementLabel: "2.1%",
      followersLabel: "210",
      sharePercent: 12,
    },
  ];

export const SOCIAL_MOCK_ANALYTICS_TOP_POSTS: readonly SocialMockAnalyticsTopPost[] =
  [
    {
      id: "analytics-post-1",
      postId: "post-2",
      title: "Hot take: close Slack before 10am",
      platform: "x",
      impressionsLabel: "18.4K",
      engagementLabel: "5.4K",
      engagementRateLabel: "6.2%",
    },
    {
      id: "analytics-post-2",
      postId: "post-1",
      title: "Golden hour at the Grand Canyon",
      platform: "instagram",
      impressionsLabel: "12.1K",
      engagementLabel: "2.8K",
      engagementRateLabel: "4.9%",
    },
    {
      id: "analytics-post-3",
      postId: "post-3",
      title: "Design handoff without Figma",
      platform: "linkedin",
      impressionsLabel: "9.6K",
      engagementLabel: "1.9K",
      engagementRateLabel: "5.4%",
    },
    {
      id: "analytics-post-4",
      postId: "post-4",
      title: "Built a SaaS in 72 hours",
      platform: "facebook",
      impressionsLabel: "4.2K",
      engagementLabel: "680",
      engagementRateLabel: "3.1%",
    },
  ];

export function isSocialMockAnalyticsSelectionId(
  value: string | null | undefined,
): value is SocialMockAnalyticsSelectionId {
  return (
    value === "impressions" ||
    value === "engagement" ||
    value === "reach" ||
    value === "followers" ||
    value === "top-post"
  );
}

export function isSocialMockAnalyticsPeriodId(
  value: string | null | undefined,
): value is SocialMockAnalyticsPeriodId {
  return value === "7d" || value === "30d";
}

export function isSocialMockAnalyticsPlatformFilterId(
  value: string | null | undefined,
): value is SocialMockAnalyticsPlatformFilterId {
  return (
    value === "all" ||
    value === "facebook" ||
    value === "instagram" ||
    value === "x" ||
    value === "linkedin" ||
    value === "dev-null"
  );
}

export function getSocialMockAnalyticsMetrics(
  period: SocialMockAnalyticsPeriodId = "7d",
  platform: SocialMockAnalyticsPlatformFilterId = "all",
): readonly SocialMockAnalyticsMetric[] {
  return buildMetrics(period, platform);
}

export function getSocialMockAnalyticsSelection(
  id: SocialMockAnalyticsSelectionId,
  options: {
    period?: SocialMockAnalyticsPeriodId;
    platform?: SocialMockAnalyticsPlatformFilterId;
  } = {},
): {
  id: SocialMockAnalyticsSelectionId;
  title: string;
  subtitle: string;
  valueFormat: "count" | "percent";
  series: readonly SocialMockAnalyticsPoint[];
} | null {
  const period = options.period ?? "7d";
  const platform = options.platform ?? "all";
  const periodLabel = period === "7d" ? "Last 7 days" : "Last 30 days";

  if (id === "top-post") {
    const series = mockDaySeries(
      period === "7d" ? TOP_POST_7D : TOP_POST_30D,
      period === "7d" ? "weekday" : "day",
    );
    return {
      id,
      title: "Top post engagement",
      subtitle: SOCIAL_MOCK_ANALYTICS.topPostTitle,
      valueFormat: "count",
      series,
    };
  }

  const metric = buildMetrics(period, platform).find(
    (entry) => entry.id === id,
  );
  if (!metric) return null;
  return {
    id: metric.id,
    title: metric.label,
    subtitle: `${periodLabel} · ${metric.valueLabel} (${metric.deltaLabel})`,
    valueFormat: metric.valueFormat,
    series: metric.series,
  };
}

export const SOCIAL_MOCK_FOLLOW_SUGGESTIONS: readonly SocialMockFollowSuggestion[] =
  [
    {
      id: "follow-1",
      name: "Nina Volkov",
      handle: "ninav",
      bio: "Product design · systems thinking",
    },
    {
      id: "follow-2",
      name: "Omar Hassan",
      handle: "omarbuilds",
      bio: "Full-stack · indie maker",
    },
    {
      id: "follow-3",
      name: "Elena Brooks",
      handle: "elenabrooks",
      bio: "Engineering manager · remote teams",
    },
  ];

export const SOCIAL_MOCK_REPLIES: readonly SocialMockReply[] = [
  {
    id: "reply-2-1",
    postId: "post-2",
    authorName: "Maya Chen",
    authorHandle: "mayauxlabs",
    authorVerified: true,
    body: "This. Also: batch Slack to two windows a day. My calendar finally looks like a human’s again.",
    createdAt: new Date(now - 12 * 60_000).toISOString(),
    likeCount: 84,
  },
  {
    id: "reply-2-2",
    postId: "post-2",
    authorName: "Omar Hassan",
    authorHandle: "omarbuilds",
    body: "Tried this last month — first week felt lonely, second week I shipped the hard feature I’d been avoiding.",
    createdAt: new Date(now - 14 * 60_000).toISOString(),
    likeCount: 41,
  },
  {
    id: "reply-2-3",
    postId: "post-2",
    authorName: "Elena Brooks",
    authorHandle: "elenabrooks",
    authorVerified: true,
    body: "We made “no Slack before 10” a team norm. Standup moved to async notes. Worth the awkward transition.",
    createdAt: new Date(now - 16 * 60_000).toISOString(),
    likeCount: 112,
  },
  {
    id: "reply-4-1",
    postId: "post-4",
    authorName: "Priya Nair",
    authorHandle: "priyanair",
    authorVerified: true,
    body: "Please drop the stack list — especially what you used for auth and billing. Curious what held up under the 72h crunch.",
    createdAt: new Date(now - 50 * 60_000).toISOString(),
    likeCount: 27,
  },
  {
    id: "reply-4-2",
    postId: "post-4",
    authorName: "Chris Lang",
    authorHandle: "chrislang",
    body: "That dashboard shot looks clean. Is the chart library custom or off-the-shelf?",
    createdAt: new Date(now - 55 * 60_000).toISOString(),
    likeCount: 9,
  },
  {
    id: "reply-10-1",
    postId: "post-10",
    authorName: "Sophia Reeves",
    authorHandle: "sophiareeves",
    authorVerified: true,
    body: "Local-first photo search is such an underrated problem. Did you run the tagging on-device or on a home server?",
    createdAt: new Date(now - 6 * 60 * 60_000).toISOString(),
    likeCount: 18,
  },
  {
    id: "reply-10-2",
    postId: "post-10",
    authorName: "Hannah Berg",
    authorHandle: "hannahberg",
    body: "“beach 2019 dog” actually made me laugh out loud. Shipping the query language people already use in their heads > fancy filters.",
    createdAt: new Date(now - 6.5 * 60 * 60_000).toISOString(),
    likeCount: 33,
  },
  {
    id: "reply-13-1",
    postId: "post-13",
    authorName: "Rahim Chowdhury",
    authorHandle: "rahimdev",
    body: "Yes. If the AI doesn’t remove a step from the workflow, it’s just a demo with a text box.",
    createdAt: new Date(now - 13 * 60 * 60_000).toISOString(),
    likeCount: 220,
  },
  {
    id: "reply-13-2",
    postId: "post-13",
    authorName: "Leo Nakamura",
    authorHandle: "leonakamura",
    body: "Counterpoint: even “search with extra steps” can win if it understands messy human language better than keywords. Still agree most ship theater though.",
    createdAt: new Date(now - 13.5 * 60 * 60_000).toISOString(),
    likeCount: 95,
  },
  {
    id: "reply-13-3",
    postId: "post-13",
    authorName: "Nina Volkov",
    authorHandle: "ninav",
    authorVerified: true,
    body: "The useful ones I’ve seen rewrite the artifact in place — doc, ticket, PR — not chat about it in a sidebar.",
    createdAt: new Date(now - 14.2 * 60 * 60_000).toISOString(),
    likeCount: 178,
  },
  {
    id: "reply-14-1",
    postId: "post-14",
    authorName: "James Osei",
    authorHandle: "jamesosei",
    body: "Those whiteboard arrows are the real MVP. Count me in for the next one.",
    createdAt: new Date(now - 17 * 60 * 60_000).toISOString(),
    likeCount: 24,
  },
  {
    id: "reply-14-2",
    postId: "post-14",
    authorName: "Aisha Patel",
    authorHandle: "aishapatel",
    authorVerified: true,
    body: "Love the “zero pitch decks” rule. More communities should steal that.",
    createdAt: new Date(now - 17.5 * 60 * 60_000).toISOString(),
    likeCount: 41,
  },
  {
    id: "reply-3-1",
    postId: "post-3",
    authorName: "Daniel Okonkwo",
    authorHandle: "danieloko",
    authorVerified: true,
    body: "We ended up with Storybook + short Loom walkthroughs. Devs rarely open Figma now — and that’s fine.",
    createdAt: new Date(now - 40 * 60_000).toISOString(),
    likeCount: 56,
  },
  {
    id: "reply-3-2",
    postId: "post-3",
    authorName: "Sofia Mendes",
    authorHandle: "sofiamendes",
    body: "Annotated screenshots still win for one-off marketing pages. Component library for product UI. Different jobs.",
    createdAt: new Date(now - 42 * 60_000).toISOString(),
    likeCount: 29,
  },
];

export function getSocialMockPostById(postId: string): SocialMockPost | null {
  return SOCIAL_MOCK_POSTS.find((post) => post.id === postId) ?? null;
}

export function getSocialMockRepliesForPost(
  postId: string,
): SocialMockReply[] {
  return SOCIAL_MOCK_REPLIES.filter((reply) => reply.postId === postId);
}

/** Local headshot used for the Personal Network avatar. */
export const SOCIAL_MOCK_PERSONAL_AVATAR_URL =
  "/social/backsteros-personal-avatar.jpg";

/**
 * Solid red banner — placeholder until LinkedIn (via Zernio) exposes cover URLs.
 * Intentionally obvious so Discover never looks “synced” for banners.
 */
export const SOCIAL_MOCK_COVER_PLACEHOLDER_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400" viewBox="0 0 1600 400"><rect width="1600" height="400" fill="#e11"/></svg>`,
  );

/** Static “you” profile for the Network → Profile page / personal Discover widget. */
export const SOCIAL_MOCK_PROFILE: SocialMockProfile = {
  firstName: "Remon",
  lastName: "de Vries",
  handle: "remon",
  verified: true,
  bio: "Building BacksterOS — personal ops, CRM, and social in one place. Design systems, shipping, and deep work mornings.",
  location: "Netherlands",
  websiteLabel: "backsteros.com",
  websiteUrl: "https://backsteros.com",
  joinedLabel: "Joined March 2024",
  followingCount: 248,
  followersCount: 1820,
  avatarUrl: SOCIAL_MOCK_PERSONAL_AVATAR_URL,
  coverUrl: SOCIAL_MOCK_COVER_PLACEHOLDER_URL,
  postIds: ["post-2", "post-13", "post-1", "post-5", "post-7"],
};

/** Local brand mark used for the Business Network avatar. */
export const SOCIAL_MOCK_BUSINESS_AVATAR_URL =
  "/social/backsteros-business-avatar.jpg";

/** Static company page profile for the Discover Business toggle. */
export const SOCIAL_MOCK_BUSINESS_PROFILE: SocialMockProfile = {
  firstName: "BacksterOS",
  lastName: "",
  handle: "backsteros",
  verified: true,
  bio: "Personal ops OS for founders and small teams. CRM, tasks, messaging, and social — one local-first workspace.",
  location: "Netherlands",
  websiteLabel: "backsteros.com",
  websiteUrl: "https://backsteros.com",
  joinedLabel: "Joined January 2023",
  followingCount: 86,
  followersCount: 12400,
  avatarUrl: SOCIAL_MOCK_BUSINESS_AVATAR_URL,
  coverUrl: SOCIAL_MOCK_COVER_PLACEHOLDER_URL,
  postIds: ["post-8", "post-3", "post-9", "post-15", "post-14"],
};

/** Business Discover rail metrics — scaled up vs personal. */
export const SOCIAL_MOCK_BUSINESS_ANALYTICS: SocialMockAnalyticsSnapshot = {
  periodLabel: "Last 7 days",
  subtitle: "Business accounts",
  metrics: buildMetrics("7d", "all").map((metric) => {
    if (metric.id === "impressions") {
      return {
        ...metric,
        valueLabel: "128.4K",
        deltaLabel: "+9.2%",
      };
    }
    if (metric.id === "engagement") {
      return {
        ...metric,
        valueLabel: "4.6%",
        deltaLabel: "+0.4%",
      };
    }
    if (metric.id === "reach") {
      return {
        ...metric,
        valueLabel: "64.1K",
        deltaLabel: "+3.8%",
        delta: "up",
      };
    }
    return {
      ...metric,
      valueLabel: "12,400",
      deltaLabel: "+186",
    };
  }),
  topPostTitle: "Ship notes: Network Social v1",
  topPostPlatform: "linkedin",
  topPostEngagementLabel: "12.8K engagements",
  topPostSeries: mockDaySeries(
    scaleSeries(TOP_POST_7D, 2.4),
    "weekday",
  ),
};

export function getSocialMockProfileForAccount(
  kind: SocialMockAccountKind,
): SocialMockProfile {
  return kind === "business"
    ? SOCIAL_MOCK_BUSINESS_PROFILE
    : SOCIAL_MOCK_PROFILE;
}

function platformAnalyticsLabel(
  platform: SocialMockAnalyticsPlatformFilterId,
): string {
  if (platform === "all") return "All platforms";
  if (platform === "x") return "Twitter/X";
  if (platform === "linkedin") return "LinkedIn";
  if (platform === "instagram") return "Instagram";
  if (platform === "dev-null") return "Dev-null";
  return "Facebook";
}

function topAnalyticsPostFor(
  kind: SocialMockAccountKind,
  platform: SocialMockAnalyticsPlatformFilterId,
): SocialMockAnalyticsTopPost | null {
  const accountPostIds = new Set(
    getSocialMockPostsForAccount(kind, platform).map((post) => post.id),
  );
  const candidates = SOCIAL_MOCK_ANALYTICS_TOP_POSTS.filter((post) => {
    if (platform !== "all" && post.platform !== platform) return false;
    return true;
  });
  return (
    candidates.find((post) => accountPostIds.has(post.postId)) ??
    candidates[0] ??
    null
  );
}

/** Discover / Analytics snapshot for Personal|Business, optionally one platform. */
export function getSocialMockAnalyticsForAccount(
  kind: SocialMockAccountKind,
  platform: SocialMockAnalyticsPlatformFilterId = "all",
): SocialMockAnalyticsSnapshot {
  const base =
    kind === "business" ? SOCIAL_MOCK_BUSINESS_ANALYTICS : SOCIAL_MOCK_ANALYTICS;
  const kindLabel = kind === "business" ? "Business" : "Personal";

  if (platform === "all") {
    return {
      ...base,
      subtitle: `${kindLabel} accounts`,
    };
  }

  const metrics =
    kind === "business"
      ? buildMetrics("7d", platform).map((metric) => {
          if (metric.id === "impressions") {
            return { ...metric, deltaLabel: "+9.2%" };
          }
          if (metric.id === "engagement") {
            return { ...metric, deltaLabel: "+0.4%" };
          }
          if (metric.id === "reach") {
            return { ...metric, deltaLabel: "+3.8%", delta: "up" as const };
          }
          return { ...metric, deltaLabel: "+42" };
        })
      : buildMetrics("7d", platform);

  const top = topAnalyticsPostFor(kind, platform);
  const feedTop = getSocialMockPostsForAccount(kind, platform)[0];

  return {
    periodLabel: "Last 7 days",
    subtitle: `${platformAnalyticsLabel(platform)} · ${kindLabel}`,
    metrics,
    topPostTitle:
      top?.title ??
      feedTop?.body.slice(0, 64) ??
      base.topPostTitle,
    topPostPlatform: top?.platform ?? feedTop?.platform ?? platform,
    topPostEngagementLabel:
      top?.engagementLabel != null
        ? `${top.engagementLabel} engagements`
        : base.topPostEngagementLabel,
    topPostSeries: mockDaySeries(
      scaleSeries(
        TOP_POST_7D,
        platform === "x"
          ? 1
          : platform === "linkedin"
            ? 0.7
            : platform === "instagram"
              ? 0.55
              : 0.35,
      ),
      "weekday",
    ),
  };
}

export function getSocialMockOwnedAccounts(
  kind: SocialMockAccountKind,
): SocialMockOwnedAccount[] {
  return SOCIAL_MOCK_OWNED_ACCOUNTS.filter((account) => account.kind === kind);
}

/** Platforms with a connected account for the selected Personal / Business bundle. */
export function getSocialMockPlatformIdsForAccount(
  kind: SocialMockAccountKind,
): SocialMockPostPlatform[] {
  const seen = new Set<SocialMockPostPlatform>();
  const platforms: SocialMockPostPlatform[] = [];
  for (const account of getSocialMockOwnedAccounts(kind)) {
    if (seen.has(account.platform)) continue;
    seen.add(account.platform);
    platforms.push(account.platform);
  }
  return platforms;
}

export function getSocialMockPostsForAccount(
  kind: SocialMockAccountKind,
  platform: SocialMockAnalyticsPlatformFilterId = "all",
): SocialMockPost[] {
  return SOCIAL_MOCK_POSTS.filter((post) => {
    if (post.accountKind !== kind) return false;
    if (platform !== "all" && post.platform !== platform) return false;
    return true;
  });
}

/** Scheduled / Planned tab — relative offsets so demos stay near “today”. */
export type SocialMockPlannedPost = {
  id: string;
  accountKind: SocialMockAccountKind;
  platform: SocialMockPostPlatform;
  /** Caption; empty + imageUrl → image-only chip. */
  body: string;
  imageUrl?: string;
  /** Days from local today (negative = past). */
  dayOffset: number;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
};

/** Split trailing `#tags` from caption copy (Instagram-style). */
export function splitSocialPlannedCaption(body: string): {
  caption: string;
  hashtags: string[];
} {
  const match = body.match(
    /^(?<caption>[\s\S]*?)(?:\n+|\s{2,}|\s+)(?<tags>(?:#[\p{L}\p{N}_]+)(?:\s+#[\p{L}\p{N}_]+)*)\s*$/u,
  );
  if (!match?.groups) {
    return { caption: body.trim(), hashtags: [] };
  }
  const caption = match.groups.caption.trimEnd();
  const hashtags = match.groups.tags.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (!caption || hashtags.length === 0) {
    return { caption: body.trim(), hashtags: [] };
  }
  return { caption, hashtags };
}

const SOCIAL_MOCK_PLANNED_POSTS: readonly SocialMockPlannedPost[] = [
  {
    id: "planned-1",
    accountKind: "personal",
    platform: "x",
    body: "Morning thread: what I’m shipping this week in BacksterOS.",
    dayOffset: 0,
    startHour: 9,
    startMinute: 0,
    durationMinutes: 30,
  },
  {
    id: "planned-2",
    accountKind: "personal",
    platform: "instagram",
    body: "",
    imageUrl:
      "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1080&h=1080&fit=crop&q=80",
    dayOffset: 0,
    startHour: 12,
    startMinute: 30,
    durationMinutes: 45,
  },
  {
    id: "planned-3",
    accountKind: "personal",
    platform: "linkedin",
    body: "Notes from last week’s product review (long-form).\n\n#product #review #backsteros",
    dayOffset: 1,
    startHour: 10,
    startMinute: 0,
    durationMinutes: 60,
  },
  {
    id: "planned-4",
    accountKind: "personal",
    platform: "facebook",
    body: "Community update: office hours open Friday.",
    dayOffset: 2,
    startHour: 16,
    startMinute: 0,
    durationMinutes: 30,
  },
  {
    id: "planned-5",
    accountKind: "personal",
    platform: "dev-null",
    body: "Chaos drop into /dev/null — scheduled for fun.",
    dayOffset: 3,
    startHour: 14,
    startMinute: 15,
    durationMinutes: 20,
  },
  {
    id: "planned-6",
    accountKind: "personal",
    platform: "x",
    body: "Weekend reading list thread.",
    dayOffset: 5,
    startHour: 11,
    startMinute: 0,
    durationMinutes: 30,
  },
  {
    id: "planned-7",
    accountKind: "business",
    platform: "linkedin",
    body: "Product launch teaser — soft announce.",
    dayOffset: 0,
    startHour: 8,
    startMinute: 30,
    durationMinutes: 45,
  },
  {
    id: "planned-8",
    accountKind: "business",
    platform: "x",
    body: "Customer win spotlight (quote card).",
    dayOffset: 0,
    startHour: 15,
    startMinute: 0,
    durationMinutes: 30,
  },
  {
    id: "planned-9",
    accountKind: "business",
    platform: "instagram",
    body: "New dashboard walkthrough — 30s reel.\n\n#product #dashboard #reel",
    imageUrl:
      "https://images.unsplash.com/photo-1551281049-9a0b8676ee36?w=1080&h=1080&fit=crop&q=80",
    dayOffset: 1,
    startHour: 13,
    startMinute: 0,
    durationMinutes: 40,
  },
  {
    id: "planned-10",
    accountKind: "business",
    platform: "facebook",
    body: "Event reminder: webinar next Tuesday.",
    dayOffset: 2,
    startHour: 9,
    startMinute: 30,
    durationMinutes: 30,
  },
  {
    id: "planned-11",
    accountKind: "business",
    platform: "linkedin",
    body: "Hiring: we’re looking for a design engineer.",
    dayOffset: 4,
    startHour: 10,
    startMinute: 0,
    durationMinutes: 60,
  },
  {
    id: "planned-12",
    accountKind: "business",
    platform: "x",
    body: "Changelog Friday — what’s new in v2.",
    dayOffset: 4,
    startHour: 17,
    startMinute: 0,
    durationMinutes: 30,
  },
];

export function getSocialMockPlannedPostsForAccount(
  kind: SocialMockAccountKind,
  platform: SocialMockAnalyticsPlatformFilterId = "all",
): SocialMockPlannedPost[] {
  return SOCIAL_MOCK_PLANNED_POSTS.filter((post) => {
    if (post.accountKind !== kind) return false;
    if (platform !== "all" && post.platform !== platform) return false;
    return true;
  });
}

export function getSocialMockPlannedPostById(
  id: string,
): SocialMockPlannedPost | null {
  return SOCIAL_MOCK_PLANNED_POSTS.find((post) => post.id === id) ?? null;
}

/** Local schedule for a planned demo post (relative to `now`). */
export function getSocialMockPlannedPostSchedule(
  post: SocialMockPlannedPost,
  now = new Date(),
): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + post.dayOffset);
  start.setHours(post.startHour, post.startMinute, 0, 0);
  const end = new Date(start.getTime() + post.durationMinutes * 60_000);
  return { start, end };
}

/** Feed-shaped card for Discover / side-panel inspect of a planned post. */
export function socialMockPlannedPostAsFeedPost(
  planned: SocialMockPlannedPost,
): SocialMockPost {
  const profile = getSocialMockProfileForAccount(planned.accountKind);
  const { start } = getSocialMockPlannedPostSchedule(planned);
  const { caption } = splitSocialPlannedCaption(planned.body);
  return {
    id: planned.id,
    authorName: socialMockProfileDisplayName(profile),
    authorHandle: profile.handle,
    authorVerified: profile.verified,
    platform: planned.platform,
    accountKind: planned.accountKind,
    body: caption || planned.body,
    imageUrl: planned.imageUrl,
    imageAlt: planned.imageUrl
      ? caption
        ? undefined
        : "Scheduled image post"
      : undefined,
    createdAt: start.toISOString(),
    replyCount: 0,
    repostCount: 0,
    likeCount: 0,
    feed: "both",
  };
}

/**
 * Resolve inbox or planned demo ids for the Network inspect rail.
 * Pending composer plans (`plan-…`) are resolved by the caller.
 */
export function resolveSocialMockInspectPost(
  postId: string,
): SocialMockPost | null {
  const inbox = getSocialMockPostById(postId);
  if (inbox) return inbox;
  const planned = getSocialMockPlannedPostById(postId);
  return planned ? socialMockPlannedPostAsFeedPost(planned) : null;
}

/** Demo “Liked” tab — curated subset of inbox posts per Personal / Business. */
const SOCIAL_MOCK_LIKED_POST_IDS: Record<
  SocialMockAccountKind,
  readonly string[]
> = {
  personal: [
    "post-1",
    "post-2",
    "post-6",
    "post-7",
    "post-10",
    "post-13",
    "post-16",
  ],
  business: ["post-3", "post-8", "post-9", "post-14", "post-15"],
};

export function getSocialMockLikedPostsForAccount(
  kind: SocialMockAccountKind,
  platform: SocialMockAnalyticsPlatformFilterId = "all",
): SocialMockPost[] {
  const likedIds = new Set(SOCIAL_MOCK_LIKED_POST_IDS[kind]);
  return getSocialMockPostsForAccount(kind, platform).filter((post) =>
    likedIds.has(post.id),
  );
}

export function getSocialMockPostsByAuthorHandle(
  handle: string,
): SocialMockPost[] {
  const normalized = handle.trim().replace(/^@/, "").toLowerCase();
  if (!normalized) return [];
  return SOCIAL_MOCK_POSTS.filter(
    (post) => post.authorHandle.toLowerCase() === normalized,
  );
}

/**
 * Profile for `/social/profile/:handle` — owned accounts first, else a layout
 * filled from that author's mock posts.
 */
export function getSocialMockProfileByHandle(
  handle: string,
): SocialMockProfile | null {
  const normalized = handle.trim().replace(/^@/, "").toLowerCase();
  if (!normalized) return null;

  for (const kind of ["personal", "business"] as const) {
    const owned = getSocialMockProfileForAccount(kind);
    if (owned.handle.toLowerCase() === normalized) return owned;
    const ownedAccount = getSocialMockOwnedAccounts(kind).find(
      (account) => account.handle.toLowerCase() === normalized,
    );
    if (ownedAccount) {
      return {
        ...owned,
        handle: ownedAccount.handle,
        firstName:
          ownedAccount.label.split(" ")[0] ?? owned.firstName,
        lastName: ownedAccount.label.split(" ").slice(1).join(" "),
      };
    }
  }

  const posts = getSocialMockPostsByAuthorHandle(normalized);
  const seed = posts[0];
  if (!seed) return null;

  const nameParts = seed.authorName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? seed.authorName;
  const lastName = nameParts.slice(1).join(" ");

  return {
    firstName,
    lastName,
    handle: seed.authorHandle,
    verified: seed.authorVerified,
    bio: `Posts and updates from @${seed.authorHandle}.`,
    location: "—",
    websiteLabel: "",
    websiteUrl: "",
    joinedLabel: "Joined 2024",
    followingCount: 120 + (seed.authorHandle.length * 11) % 400,
    followersCount: 800 + (seed.likeCount % 5000),
    avatarUrl:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&q=80",
    coverUrl:
      "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1600&q=80",
    postIds: posts.map((post) => post.id),
  };
}
