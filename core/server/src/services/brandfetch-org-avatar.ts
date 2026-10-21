/**
 * Persist Brandfetch logos as organization avatars so CardDAV can sync them.
 *
 * Desktop embeds Logo CDN URLs in <img> (hotlink-only). Programmatic CDN
 * fetches are blocked — we use Brand API + credentialed asset `src` URLs.
 * https://docs.brandfetch.com/logo-api/overview
 */
import * as circleService from "./circle-domain.js";

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

export function brandfetchApiKeyFromEnv(): string | null {
  const key = process.env.BRANDFETCH_API_KEY?.trim() || "";
  return key || null;
}

/** @deprecated Prefer Brand API — CDN URLs are display-only. */
export function brandfetchClientIdFromEnv(): string | null {
  const id =
    process.env.BRANDFETCH_CLIENT_ID?.trim() ||
    process.env.VITE_BRANDFETCH_CLIENT_ID?.trim() ||
    "";
  return id || null;
}

/** @deprecated CDN hotlink helper kept for tests / docs parity. */
export function brandfetchLogoUrl(
  domain: string,
  clientId: string,
  size = 512,
): string {
  const host = domain.trim().toLowerCase().replace(/^www\./, "");
  return (
    `https://cdn.brandfetch.io/domain/${encodeURIComponent(host)}` +
    `/w/${size}/h/${size}/theme/dark/fallback/404/type/icon` +
    `?c=${encodeURIComponent(clientId)}`
  );
}

type BrandfetchFormat = {
  src?: string;
  format?: string;
  width?: number;
  height?: number;
};

type BrandfetchLogo = {
  type?: string;
  theme?: string;
  formats?: BrandfetchFormat[];
};

type BrandfetchBrand = {
  logos?: BrandfetchLogo[];
};

function pickRasterIconSrc(brand: BrandfetchBrand): string | null {
  const candidates: { score: number; src: string }[] = [];
  for (const logo of brand.logos ?? []) {
    for (const fmt of logo.formats ?? []) {
      const src = fmt.src?.trim();
      if (!src) continue;
      const format = (fmt.format || "").toLowerCase();
      if (!["jpeg", "jpg", "png", "webp"].includes(format)) continue;
      let score = 0;
      if (logo.type === "icon") score += 20;
      if (logo.type === "logo") score += 5;
      if (logo.theme === "dark") score += 2;
      if (format === "jpeg" || format === "jpg") score += 2;
      if (format === "png") score += 1;
      const w = fmt.width ?? 0;
      if (w >= 256 && w <= 512) score += 3;
      else if (w > 512) score += 1;
      candidates.push({ score, src });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.src ?? null;
}

export type EnsureOrgLogoResult =
  | { status: "stored"; byteSize: number; contentType: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/**
 * If the org has no avatar but has a website, Brand API → store as organization avatar.
 */
export async function ensureOrganizationLogoFromBrandfetch(
  workspaceId: string,
  org: {
    id: string;
    website: string | null;
    avatarStorageKey?: string | null;
  },
  options?: { force?: boolean; apiKey?: string | null },
): Promise<EnsureOrgLogoResult> {
  if (!options?.force && org.avatarStorageKey?.trim()) {
    return { status: "skipped", reason: "already_has_avatar" };
  }

  const existing = await circleService.getAvatar(
    workspaceId,
    "organization",
    org.id,
  );
  if (!options?.force && existing?.bytes?.length) {
    return { status: "skipped", reason: "avatar_row_exists" };
  }

  const apiKey = options?.apiKey ?? brandfetchApiKeyFromEnv();
  if (!apiKey) {
    return { status: "skipped", reason: "no_brandfetch_api_key" };
  }

  const domain = registrableDomainFromWebsite(org.website);
  if (!domain) {
    return { status: "skipped", reason: "no_website_domain" };
  }

  let brandRes: Response;
  try {
    brandRes = await fetch(
      `https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "brand_api_fetch_error",
    };
  }

  if (brandRes.status === 404) {
    return { status: "skipped", reason: "brand_not_found" };
  }
  if (!brandRes.ok) {
    return { status: "failed", reason: `brand_api_http_${brandRes.status}` };
  }

  let brand: BrandfetchBrand;
  try {
    brand = (await brandRes.json()) as BrandfetchBrand;
  } catch {
    return { status: "failed", reason: "brand_api_bad_json" };
  }

  const assetUrl = pickRasterIconSrc(brand);
  if (!assetUrl) {
    return { status: "skipped", reason: "no_raster_logo" };
  }

  let imageRes: Response;
  try {
    imageRes = await fetch(assetUrl, {
      redirect: "follow",
      headers: { Accept: "image/*,*/*" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "asset_fetch_error",
    };
  }

  if (!imageRes.ok) {
    return { status: "failed", reason: `asset_http_${imageRes.status}` };
  }

  const contentType = (
    imageRes.headers.get("content-type") || "image/jpeg"
  )
    .split(";")[0]!
    .trim()
    .toLowerCase();
  if (!contentType.startsWith("image/") || contentType.includes("svg")) {
    return { status: "failed", reason: `not_raster:${contentType}` };
  }

  const buffer = new Uint8Array(await imageRes.arrayBuffer());
  if (buffer.byteLength < 32) {
    return { status: "failed", reason: "empty_body" };
  }
  if (buffer.byteLength > 5_000_000) {
    return { status: "failed", reason: "too_large" };
  }

  await circleService.putAvatar(
    workspaceId,
    "organization",
    org.id,
    buffer,
    contentType,
  );

  return {
    status: "stored",
    byteSize: buffer.byteLength,
    contentType,
  };
}

export async function hydrateOrganizationLogosFromBrandfetch(
  workspaceId: string,
  options?: { concurrency?: number; force?: boolean },
): Promise<{
  stored: number;
  skipped: number;
  failed: number;
  total: number;
  reasons: Record<string, number>;
}> {
  const orgs = await circleService.listOrganizations(workspaceId);
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 3, 6));
  let stored = 0;
  let skipped = 0;
  let failed = 0;
  let index = 0;
  const reasons: Record<string, number> = {};

  async function worker() {
    while (index < orgs.length) {
      const org = orgs[index++]!;
      const result = await ensureOrganizationLogoFromBrandfetch(
        workspaceId,
        org,
        { force: options?.force },
      );
      if (result.status === "stored") stored += 1;
      else if (result.status === "skipped") {
        skipped += 1;
        reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
      } else {
        failed += 1;
        reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, orgs.length) }, () => worker()),
  );

  return { stored, skipped, failed, total: orgs.length, reasons };
}
