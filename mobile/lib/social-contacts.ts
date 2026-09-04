/** Pure social-contact helpers (desktop `social-contacts` parity). */

export type ContactSocialAccount = {
  platform: string;
  url: string;
};

/** Parse PowerSync/API social_accounts JSON into cleaned `{ platform, url }[]`. */
export function normalizeContactSocialAccounts(
  raw: unknown,
): ContactSocialAccount[] {
  let accounts: unknown = raw ?? [];
  if (typeof accounts === "string") {
    try {
      accounts = JSON.parse(accounts) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(accounts)) return [];
  return accounts
    .filter(
      (entry): entry is { platform: unknown; url: unknown } =>
        entry != null &&
        typeof entry === "object" &&
        "platform" in entry &&
        "url" in entry,
    )
    .map((entry) => ({
      platform: String(entry.platform ?? ""),
      url: String(entry.url ?? ""),
    }))
    .filter((entry) => entry.platform.length > 0 && entry.url.length > 0)
    .slice(0, 20);
}

export function contactHasSocialAccounts(raw: unknown): boolean {
  return normalizeContactSocialAccounts(raw).length > 0;
}

/** Prefer LinkedIn, then X, then first account — for list badge. */
export function primarySocialAccount(
  accounts: ContactSocialAccount[],
): ContactSocialAccount | null {
  if (accounts.length === 0) return null;
  const linkedIn = accounts.find(
    (entry) => normalizeSocialPlatform(entry.platform) === "linkedin",
  );
  if (linkedIn) return linkedIn;
  const x = accounts.find(
    (entry) => normalizeSocialPlatform(entry.platform) === "x",
  );
  if (x) return x;
  return accounts[0] ?? null;
}

export type SocialPlatformId =
  | "linkedin"
  | "x"
  | "instagram"
  | "github"
  | "website"
  | "other";

export function normalizeSocialPlatform(platform: string): SocialPlatformId {
  const key = platform.trim().toLowerCase();
  if (key === "linkedin" || key === "linked-in") return "linkedin";
  if (key === "x" || key === "twitter" || key === "x.com") return "x";
  if (key === "instagram" || key === "ig") return "instagram";
  if (key === "github" || key === "gh") return "github";
  if (key === "website" || key === "web" || key === "site") return "website";
  return "other";
}

/** Single-line address for social detail (desktop `formatContactAddressLine`). */
export function formatSocialAddressLine(parts: {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  region?: string | null;
  country?: string | null;
}): string | null {
  const street = parts.address?.trim() || "";
  const locality = [
    parts.postalCode?.trim(),
    parts.city?.trim(),
    parts.region?.trim(),
  ]
    .filter(Boolean)
    .join(" ");
  const country = parts.country?.trim() || "";
  const combined = [street, locality, country].filter(Boolean).join(", ");
  return combined || null;
}
