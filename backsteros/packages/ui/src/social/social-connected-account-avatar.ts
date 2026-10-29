import type { SocialMockAccountKind } from "./social-mock-data.js";

/** Minimal account shape from GET /api/v1/settings/social. */
export type SocialConnectedAccountAvatar = {
  platform: string;
  avatarUrl?: string | null;
  handle?: string | null;
  displayName?: string | null;
  url?: string | null;
  bio?: string | null;
  followersCount?: number | null;
  disconnected?: boolean;
};

/**
 * Map Network feed platform filter + Personal/Business toggle → stored
 * `social_accounts.platform` (Zernio-normalized).
 */
export function socialAccountPlatformForFeed(input: {
  feedPlatform: string;
  accountKind: SocialMockAccountKind;
}): string | null {
  const feed = input.feedPlatform.trim().toLowerCase();
  if (feed === "linkedin") {
    return input.accountKind === "business"
      ? "linkedin_org"
      : "linkedin_personal";
  }
  if (feed === "facebook") return "facebook_page";
  if (feed === "instagram") return "instagram";
  if (feed === "x") return "x";
  if (feed === "youtube") return "youtube";
  return null;
}

export function findSocialConnectedAccount(input: {
  feedPlatform: string;
  accountKind: SocialMockAccountKind;
  connectedAccounts: readonly SocialConnectedAccountAvatar[];
}): SocialConnectedAccountAvatar | null {
  const wanted = socialAccountPlatformForFeed({
    feedPlatform: input.feedPlatform,
    accountKind: input.accountKind,
  });
  if (!wanted) return null;
  return (
    input.connectedAccounts.find(
      (account) => account.platform === wanted && !account.disconnected,
    ) ?? null
  );
}

/** Split provider display name into Discover first/last (business = page name only). */
export function splitSocialDisplayName(
  displayName: string,
  accountKind: SocialMockAccountKind,
): { firstName: string; lastName: string } {
  const trimmed = displayName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  if (accountKind === "business") {
    return { firstName: trimmed, lastName: "" };
  }
  const space = trimmed.indexOf(" ");
  if (space < 0) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, space),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

/** LinkedIn vanity slug from /in/… or /company/… profile URLs. */
export function vanityFromSocialProfileUrl(
  url: string | null | undefined,
): string | null {
  if (!url?.trim()) return null;
  try {
    const match = new URL(url.trim()).pathname.match(
      /\/(?:in|company)\/([^/?#]+)/i,
    );
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]).replace(/\/+$/, "") || null;
  } catch {
    return null;
  }
}

/**
 * True when a value is usable as @handle (not a spaced display name).
 * Zernio often puts the LinkedIn display name in `username`.
 */
export function isPlausibleSocialHandle(
  value: string | null | undefined,
  displayName?: string | null,
): boolean {
  const handle = value?.trim().replace(/^@+/, "") ?? "";
  if (!handle || /\s/.test(handle)) return false;
  if (handle.toLowerCase().startsWith("company/")) return false;
  const display = displayName?.trim() ?? "";
  if (display && handle.toLowerCase() === display.toLowerCase()) return false;
  return true;
}

/** Pick @handle: stored handle if plausible, else vanity from profile URL. */
export function resolveSocialHandle(input: {
  handle?: string | null;
  displayName?: string | null;
  url?: string | null;
  fallbackHandle?: string | null;
}): string | null {
  const displayName = input.displayName?.trim() || null;
  const fromAccount = input.handle?.trim().replace(/^@+/, "") || null;
  if (isPlausibleSocialHandle(fromAccount, displayName)) return fromAccount;
  const fromUrl = vanityFromSocialProfileUrl(input.url);
  if (isPlausibleSocialHandle(fromUrl, displayName)) return fromUrl;
  const fallback = input.fallbackHandle?.trim().replace(/^@+/, "") || null;
  if (isPlausibleSocialHandle(fallback, displayName)) return fallback;
  return fromUrl || fallback || null;
}

/** Prefer the connected account’s provider avatar when LinkedIn (etc.) is selected. */
export function resolveSocialComposerAvatarUrl(input: {
  feedPlatform: string;
  accountKind: SocialMockAccountKind;
  connectedAccounts: readonly SocialConnectedAccountAvatar[];
  fallbackAvatarUrl: string | null | undefined;
}): string | null {
  const match = findSocialConnectedAccount(input);
  const avatar = match?.avatarUrl?.trim();
  if (avatar) return avatar;
  const fallback = input.fallbackAvatarUrl?.trim();
  return fallback || null;
}

/** Prefer connected account display name + @handle when a platform is selected. */
export function resolveSocialConnectedIdentity(input: {
  feedPlatform: string;
  accountKind: SocialMockAccountKind;
  connectedAccounts: readonly SocialConnectedAccountAvatar[];
  fallbackHandle?: string | null;
  fallbackDisplayName?: string | null;
  fallbackBio?: string | null;
  fallbackFollowersCount?: number | null;
}): {
  handle: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  followersCount: number | null;
} {
  const match = findSocialConnectedAccount(input);
  const platformBound = socialAccountPlatformForFeed({
    feedPlatform: input.feedPlatform,
    accountKind: input.accountKind,
  });
  const displayName =
    match?.displayName?.trim() ||
    input.fallbackDisplayName?.trim() ||
    null;
  // Selected networks: only show provider bio. Don't fill LinkedIn org
  // (etc.) with mock BacksterOS copy when Zernio has no description.
  const bio =
    match?.bio?.trim() ||
    (!platformBound ? input.fallbackBio?.trim() : null) ||
    null;
  const followersFromAccount =
    typeof match?.followersCount === "number" &&
    Number.isFinite(match.followersCount)
      ? Math.max(0, Math.floor(match.followersCount))
      : null;
  const followersCount =
    followersFromAccount ??
    (!platformBound &&
    typeof input.fallbackFollowersCount === "number" &&
    Number.isFinite(input.fallbackFollowersCount)
      ? Math.max(0, Math.floor(input.fallbackFollowersCount))
      : null);
  const handle = resolveSocialHandle({
    handle: match?.handle,
    displayName: match?.displayName ?? displayName,
    url: match?.url,
    fallbackHandle: input.fallbackHandle,
  });
  if (!displayName) {
    return {
      handle,
      displayName: null,
      firstName: null,
      lastName: null,
      bio,
      followersCount,
    };
  }
  const { firstName, lastName } = splitSocialDisplayName(
    displayName,
    input.accountKind,
  );
  return { handle, displayName, firstName, lastName, bio, followersCount };
}
