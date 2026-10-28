export const SOCIAL_NAV_IDS = [
  "home",
  "explore",
  "notifications",
  "messages",
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
  { id: "home", label: "Home", href: "/social" },
  { id: "explore", label: "Explore", href: "/social/explore" },
  {
    id: "notifications",
    label: "Notifications",
    href: "/social/notifications",
  },
  { id: "messages", label: "Messages", href: "/social/messages" },
  { id: "bookmarks", label: "Bookmarks", href: "/social/bookmarks" },
  { id: "profile", label: "Profile", href: "/social/profile" },
] as const;

const SOCIAL_NAV_ID_SET = new Set<string>(SOCIAL_NAV_IDS);

export function isSocialNavId(
  value: string | null | undefined,
): value is SocialNavId {
  return Boolean(value && SOCIAL_NAV_ID_SET.has(value));
}

export function getSocialNavHref(id: SocialNavId): string {
  if (id === "home") return "/social";
  return `/social/${id}`;
}

export function getSelectedSocialNavIdFromPathname(
  pathname: string,
): SocialNavId {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "social") return "home";
  const slug = parts[1];
  if (!slug || slug === "home") return "home";
  if (isSocialNavId(slug)) return slug;
  return "home";
}

export function resolveSocialSidePanelHref(itemId: string): string | null {
  if (isSocialNavId(itemId)) return getSocialNavHref(itemId);
  return null;
}
