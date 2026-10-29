export const SOCIAL_NAV_IDS = [
  "home",
  "analytics",
  "explore",
  "notifications",
  "bookmarks",
  "profile",
] as const;

export type SocialNavId = (typeof SOCIAL_NAV_IDS)[number];

export type SocialNavItem = {
  id: SocialNavId;
  label: string;
  href: string;
};

export const SOCIAL_NAV_ITEMS: readonly SocialNavItem[] = [
  { id: "home", label: "Network", href: "/social" },
  { id: "analytics", label: "Analytics", href: "/social/analytics" },
  { id: "explore", label: "Explore", href: "/social/explore" },
  {
    id: "notifications",
    label: "Notifications",
    href: "/social/notifications",
  },
  { id: "bookmarks", label: "Bookmarks", href: "/social/bookmarks" },
  { id: "profile", label: "Profile", href: "/social/profile" },
] as const;

/** Platform feeds under the Network side-panel nav. */
export const SOCIAL_PLATFORM_NAV_IDS = [
  "facebook",
  "instagram",
  "x",
  "linkedin",
  "dev-null",
] as const;

export type SocialPlatformNavId = (typeof SOCIAL_PLATFORM_NAV_IDS)[number];

export type SocialPlatformNavItem = {
  id: SocialPlatformNavId;
  label: string;
  /** Value passed to `socialPlatformIcon` / brand icons. */
  platform: "Facebook" | "Instagram" | "X" | "LinkedIn" | "Dev-null";
  href: string;
};

export const SOCIAL_PLATFORM_NAV_ITEMS: readonly SocialPlatformNavItem[] = [
  {
    id: "facebook",
    label: "Facebook",
    platform: "Facebook",
    href: "/social/facebook",
  },
  {
    id: "instagram",
    label: "Instagram",
    platform: "Instagram",
    href: "/social/instagram",
  },
  {
    id: "x",
    label: "Twitter/X",
    platform: "X",
    href: "/social/x",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    platform: "LinkedIn",
    href: "/social/linkedin",
  },
  {
    id: "dev-null",
    label: "Dev-null",
    platform: "Dev-null",
    href: "/social/dev-null",
  },
] as const;

export type SocialSidePanelSelectionId = SocialNavId | SocialPlatformNavId;

const SOCIAL_NAV_ID_SET = new Set<string>(SOCIAL_NAV_IDS);
const SOCIAL_PLATFORM_NAV_ID_SET = new Set<string>(SOCIAL_PLATFORM_NAV_IDS);

export function isSocialNavId(
  value: string | null | undefined,
): value is SocialNavId {
  return Boolean(value && SOCIAL_NAV_ID_SET.has(value));
}

export function isSocialPlatformNavId(
  value: string | null | undefined,
): value is SocialPlatformNavId {
  return Boolean(value && SOCIAL_PLATFORM_NAV_ID_SET.has(value));
}

export function getSocialNavHref(id: SocialNavId): string {
  if (id === "home") return "/social";
  return `/social/${id}`;
}

export function getSocialPlatformNavHref(id: SocialPlatformNavId): string {
  return `/social/${id}`;
}

export function getSocialPostHref(postId: string): string {
  return `/social/post/${encodeURIComponent(postId)}`;
}

/** Own profile (`/social/profile`) or another author (`/social/profile/:handle`). */
export function getSocialProfileHref(handle?: string | null): string {
  const trimmed = handle?.trim().replace(/^@/, "");
  if (!trimmed) return "/social/profile";
  return `/social/profile/${encodeURIComponent(trimmed)}`;
}

export type SocialAnalyticsHrefOptions = {
  metric?: string | null;
  period?: string | null;
  platform?: string | null;
};

/** `/social/analytics` with optional metric / period / platform query. */
export function getSocialAnalyticsHref(
  options: SocialAnalyticsHrefOptions = {},
): string {
  const params = new URLSearchParams();
  if (options.metric) params.set("metric", options.metric);
  if (options.period) params.set("period", options.period);
  if (options.platform && options.platform !== "all") {
    params.set("platform", options.platform);
  }
  const query = params.toString();
  return query ? `/social/analytics?${query}` : "/social/analytics";
}

/** Network feed list tabs (`/social?tab=planned`). */
export const SOCIAL_FEED_TAB_IDS = [
  "inbox",
  "planned",
  "liked",
  "saved",
] as const;

export type SocialFeedTabId = (typeof SOCIAL_FEED_TAB_IDS)[number];

export const SOCIAL_FEED_TAB_PARAM = "tab";
export const DEFAULT_SOCIAL_FEED_TAB: SocialFeedTabId = "inbox";

const SOCIAL_FEED_TAB_ID_SET = new Set<string>(SOCIAL_FEED_TAB_IDS);

export function isSocialFeedTabId(
  value: string | null | undefined,
): value is SocialFeedTabId {
  return Boolean(value && SOCIAL_FEED_TAB_ID_SET.has(value));
}

export function getSocialFeedTabFromSearch(
  searchStr: string,
): SocialFeedTabId {
  const raw = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const value = new URLSearchParams(raw).get(SOCIAL_FEED_TAB_PARAM);
  // Legacy Drafts tab folded into Planned (unscheduled posts live in the tray).
  if (value === "drafts") return "planned";
  if (isSocialFeedTabId(value)) return value;
  return DEFAULT_SOCIAL_FEED_TAB;
}

export type SocialFeedHrefOptions = {
  tab?: SocialFeedTabId | null;
  /** Defaults to `/social`. Keep platform legacy paths when provided. */
  pathname?: string;
  /** Existing search — unrelated params are preserved. */
  searchStr?: string;
};

/** Build a Network feed href with an optional `tab` query. */
export function getSocialFeedHref(options: SocialFeedHrefOptions = {}): string {
  const pathname = options.pathname?.trim() || "/social";
  const params = new URLSearchParams(
    options.searchStr?.startsWith("?")
      ? options.searchStr.slice(1)
      : (options.searchStr ?? ""),
  );
  const tab = options.tab ?? DEFAULT_SOCIAL_FEED_TAB;
  if (tab === DEFAULT_SOCIAL_FEED_TAB) {
    params.delete(SOCIAL_FEED_TAB_PARAM);
  } else {
    params.set(SOCIAL_FEED_TAB_PARAM, tab);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function getSocialAnalyticsMetricFromSearch(
  searchStr: string,
): string | null {
  const raw = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const value = new URLSearchParams(raw).get("metric");
  return value?.trim() || null;
}

export function getSocialAnalyticsPeriodFromSearch(
  searchStr: string,
): string | null {
  const raw = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const value = new URLSearchParams(raw).get("period");
  return value?.trim() || null;
}

export function getSocialAnalyticsPlatformFromSearch(
  searchStr: string,
): string | null {
  const raw = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const value = new URLSearchParams(raw).get("platform");
  return value?.trim() || null;
}

/** `/social/post/:postId` → post id, otherwise null. */
export function getSelectedSocialPostIdFromPathname(
  pathname: string,
): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "social" || parts[1] !== "post") return null;
  const postId = parts[2];
  return postId ? decodeURIComponent(postId) : null;
}

/** `/social/profile/:handle` → handle, otherwise null (own profile has no handle segment). */
export function getSelectedSocialProfileHandleFromPathname(
  pathname: string,
): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "social" || parts[1] !== "profile") return null;
  const handle = parts[2];
  return handle ? decodeURIComponent(handle) : null;
}

export function getSelectedSocialNavIdFromPathname(
  pathname: string,
): SocialSidePanelSelectionId {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "social") return "home";
  // Post detail keeps Network selected in the side panel.
  if (parts[1] === "post") return "home";
  // Author profile keeps Profile selected in the side panel.
  if (parts[1] === "profile") return "profile";
  const slug = parts[1];
  if (!slug || slug === "home" || slug === "network") return "home";
  // Legacy platform routes (/social/facebook, …) map to Network — filter lives in the feed.
  if (isSocialPlatformNavId(slug)) return "home";
  if (isSocialNavId(slug)) return slug;
  return "home";
}

/** Platform slug from a legacy `/social/:platform` path, otherwise null. */
export function getSocialFeedPlatformFromPathname(
  pathname: string,
): SocialPlatformNavId | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "social") return null;
  const slug = parts[1];
  return isSocialPlatformNavId(slug) ? slug : null;
}

export function getSocialSidePanelSelectionLabel(
  id: SocialSidePanelSelectionId,
): string {
  if (id === "home") return "Network";
  const nav = SOCIAL_NAV_ITEMS.find((item) => item.id === id);
  if (nav) return nav.label;
  const platform = SOCIAL_PLATFORM_NAV_ITEMS.find((item) => item.id === id);
  if (platform) return platform.label;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function resolveSocialSidePanelHref(itemId: string): string | null {
  if (isSocialNavId(itemId)) return getSocialNavHref(itemId);
  if (isSocialPlatformNavId(itemId)) return getSocialPlatformNavHref(itemId);
  return null;
}
