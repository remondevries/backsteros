/**
 * Brandfetch Logo API helpers for organization avatars.
 *
 * Logo CDN URLs are meant for `<img src>` embedding (not server-side scraping).
 * Manual uploads (avatarStorageKey) always take priority over Brandfetch.
 */

/** Extract a registrable hostname from a website field / URL. */
export function registrableDomainFromWebsite(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed.replace(/^\/+/, "")}`;
    const host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || !host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

export type BrandfetchLogoUrlOptions = {
  /** Pixel size requested from Brandfetch (served 2× for retina-friendly). */
  size?: number;
  /** `icon` fits round avatars; `logo` / `symbol` also support SVG. */
  type?: "icon" | "logo" | "symbol";
  theme?: "light" | "dark";
};

/**
 * Build a Brandfetch Logo CDN URL for a domain.
 * Returns null when domain or clientId is missing.
 */
export function brandfetchLogoUrl(
  domain: string,
  clientId: string,
  options: BrandfetchLogoUrlOptions = {},
): string | null {
  const host = domain.trim().toLowerCase().replace(/^www\./, "");
  const id = clientId.trim();
  if (!host || !id) return null;

  const size = Math.max(16, Math.round(options.size ?? 128));
  const type = options.type ?? "icon";
  const theme = options.theme ?? "dark";

  return (
    `https://cdn.brandfetch.io/domain/${encodeURIComponent(host)}` +
    `/w/${size}/h/${size}/theme/${theme}/fallback/404/type/${type}` +
    `?c=${encodeURIComponent(id)}`
  );
}

export function brandfetchLogoUrlFromWebsite(
  website: string | null | undefined,
  clientId: string | null | undefined,
  options?: BrandfetchLogoUrlOptions,
): string | null {
  const id = clientId?.trim();
  if (!id) return null;
  const domain = registrableDomainFromWebsite(website);
  if (!domain) return null;
  return brandfetchLogoUrl(domain, id, options);
}

/**
 * Resolve the display avatar for an organization:
 * 1. Manual / stored upload (caller passes the resolved blob URL)
 * 2. Brandfetch from website when no storage key
 * 3. null
 */
export function resolveOrganizationAvatarSrc(input: {
  uploadedSrc?: string | null;
  avatarStorageKey?: string | null;
  website?: string | null;
  brandfetchClientId?: string | null;
}): string | null {
  const uploaded = input.uploadedSrc?.trim() || null;
  if (uploaded) return uploaded;

  // Manual avatar exists but blob URL not ready yet — don't flash Brandfetch.
  if (input.avatarStorageKey?.trim()) return null;

  return brandfetchLogoUrlFromWebsite(
    input.website,
    input.brandfetchClientId,
  );
}
