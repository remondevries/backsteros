/**
 * Persist Brandfetch logos as organization avatars so CardDAV (and clients)
 * can sync them. Desktop already shows Brandfetch CDN URLs without storing;
 * this fills `avatars` + `organizations.avatar_storage_key` when missing.
 */
import * as circleService from "./circle-domain.js";

const DEFAULT_SIZE = 512;

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

export function brandfetchClientIdFromEnv(): string | null {
  const id =
    process.env.BRANDFETCH_CLIENT_ID?.trim() ||
    process.env.VITE_BRANDFETCH_CLIENT_ID?.trim() ||
    "";
  return id || null;
}

export function brandfetchLogoUrl(
  domain: string,
  clientId: string,
  size = DEFAULT_SIZE,
): string {
  const host = domain.trim().toLowerCase().replace(/^www\./, "");
  return (
    `https://cdn.brandfetch.io/domain/${encodeURIComponent(host)}` +
    `/w/${size}/h/${size}/theme/dark/fallback/404/type/icon` +
    `?c=${encodeURIComponent(clientId)}`
  );
}

export type EnsureOrgLogoResult =
  | { status: "stored"; byteSize: number; contentType: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/**
 * If the org has no avatar but has a website, download Brandfetch icon and
 * `putAvatar` as `organization` (same path CardDAV reads).
 */
export async function ensureOrganizationLogoFromBrandfetch(
  workspaceId: string,
  org: {
    id: string;
    website: string | null;
    avatarStorageKey?: string | null;
  },
  options?: { force?: boolean; clientId?: string | null },
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

  const clientId = options?.clientId ?? brandfetchClientIdFromEnv();
  if (!clientId) {
    return { status: "skipped", reason: "no_brandfetch_client_id" };
  }

  const domain = registrableDomainFromWebsite(org.website);
  if (!domain) {
    return { status: "skipped", reason: "no_website_domain" };
  }

  const url = brandfetchLogoUrl(domain, clientId);
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "image/*,*/*" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "fetch_error",
    };
  }

  if (response.status === 404) {
    return { status: "skipped", reason: "brandfetch_404" };
  }
  if (!response.ok) {
    return { status: "failed", reason: `http_${response.status}` };
  }

  const contentType = (
    response.headers.get("content-type") || "image/png"
  ).split(";")[0]!.trim().toLowerCase();
  if (contentType.includes("svg")) {
    // CardDAV / sharp path prefer raster; skip SVG icons for now.
    return { status: "skipped", reason: "svg_unsupported" };
  }
  if (!contentType.startsWith("image/")) {
    return { status: "failed", reason: `not_image:${contentType}` };
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
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
    contentType.startsWith("image/") ? contentType : "image/png",
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
}> {
  const orgs = await circleService.listOrganizations(workspaceId);
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, 8));
  let stored = 0;
  let skipped = 0;
  let failed = 0;
  let index = 0;

  async function worker() {
    while (index < orgs.length) {
      const org = orgs[index++]!;
      const result = await ensureOrganizationLogoFromBrandfetch(
        workspaceId,
        org,
        { force: options?.force },
      );
      if (result.status === "stored") stored += 1;
      else if (result.status === "skipped") skipped += 1;
      else failed += 1;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, orgs.length) }, () => worker()),
  );

  return { stored, skipped, failed, total: orgs.length };
}
