/**
 * SSRF-safe URL metadata fetch for shell chat link previews.
 * Resolves DNS, blocks private/loopback/Tailscale/link-local, caps size/time.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { ChatThreadLinkPreview } from "@backsteros/contracts";

export const CHAT_LINK_PREVIEW_TIMEOUT_MS = 5_000;
export const CHAT_LINK_PREVIEW_MAX_BYTES = 512_000;
export const CHAT_LINK_PREVIEW_MAX_URLS = 5;
export const CHAT_LINK_PREVIEW_CACHE_TTL_MS = 60 * 60 * 1000;

const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;

type CacheEntry = {
  expiresAt: number;
  preview: ChatThreadLinkPreview | null;
};

const previewCache = new Map<string, CacheEntry>();

export function extractHttpUrls(text: string, max = CHAT_LINK_PREVIEW_MAX_URLS): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(URL_RE)) {
    let raw = match[0] ?? "";
    // Trim common trailing punctuation.
    raw = raw.replace(/[.,;:!?)]+$/g, "");
    let normalized: string;
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      url.hash = "";
      normalized = url.toString();
    } catch {
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    found.push(normalized);
    if (found.length >= max) break;
  }
  return found;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

/** True when the address must not be fetched (SSRF). */
export function isBlockedIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const n = ipv4ToInt(address);
    if (n == null) return true;
    // 0.0.0.0/8, 127.0.0.0/8
    if ((n >>> 24) === 0 || (n >>> 24) === 127) return true;
    // 10.0.0.0/8
    if ((n >>> 24) === 10) return true;
    // 172.16.0.0/12
    if ((n >>> 24) === 172 && ((n >>> 16) & 0xf0) === 16) return true;
    // 192.168.0.0/16
    if ((n >>> 24) === 192 && ((n >>> 16) & 0xff) === 168) return true;
    // 169.254.0.0/16 link-local
    if ((n >>> 24) === 169 && ((n >>> 16) & 0xff) === 254) return true;
    // 100.64.0.0/10 Tailscale / CGNAT
    if ((n >>> 24) === 100 && ((n >>> 16) & 0xc0) === 64) return true;
    // 192.0.0.0/24, 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 docs
    if ((n >>> 24) === 192 && ((n >>> 16) & 0xff) === 0) return true;
    // Broadcast / multicast
    if ((n >>> 24) >= 224) return true;
    return false;
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    // fe80::/10 link-local, fc00::/7 unique local, ::ffff: mapped handled below
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
      return true;
    }
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.slice("::ffff:".length);
      return isBlockedIpAddress(v4);
    }
    return false;
  }
  return true;
}

export async function assertUrlSafeForFetch(urlString: string): Promise<URL> {
  const url = new URL(urlString);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed");
  }
  const hostname = url.hostname;
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Localhost URLs are not allowed");
  }
  if (hostname === "metadata.google.internal" || hostname.endsWith(".internal")) {
    throw new Error("Internal hostnames are not allowed");
  }

  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new Error("Private or reserved IP addresses are not allowed");
    }
    return url;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error("Could not resolve hostname");
  }
  for (const record of records) {
    if (isBlockedIpAddress(record.address)) {
      throw new Error("Hostname resolves to a private or reserved address");
    }
  }
  return url;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

function metaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]?.trim()) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

function titleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match?.[1]?.trim()) return null;
  return decodeHtmlEntities(match[1].trim());
}

function faviconFromHtml(html: string, base: URL): string | null {
  const match = html.match(
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
  ) ?? html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
  );
  if (!match?.[1]) return null;
  try {
    return new URL(match[1], base).toString();
  } catch {
    return null;
  }
}

function absoluteUrl(base: URL, value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function parseHtmlPreview(url: URL, html: string): ChatThreadLinkPreview {
  const title =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    titleFromHtml(html);
  const description =
    metaContent(html, "og:description") ??
    metaContent(html, "twitter:description") ??
    metaContent(html, "description");
  const imageUrl = absoluteUrl(
    url,
    metaContent(html, "og:image") ?? metaContent(html, "twitter:image"),
  );
  const siteName =
    metaContent(html, "og:site_name") ?? url.hostname.replace(/^www\./, "");
  const faviconUrl =
    faviconFromHtml(html, url) ?? `${url.origin}/favicon.ico`;

  return {
    url: url.toString(),
    siteName: siteName || null,
    faviconUrl,
    title: title || null,
    description: description || null,
    imageUrl,
  };
}

export type FetchLinkPreviewDeps = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  lookupHost?: typeof lookup;
};

async function fetchOnePreview(
  urlString: string,
  deps: FetchLinkPreviewDeps = {},
): Promise<ChatThreadLinkPreview | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now?.() ?? Date.now();
  const cached = previewCache.get(urlString);
  if (cached && cached.expiresAt > now) {
    return cached.preview;
  }

  let url: URL;
  try {
    // Re-check DNS via assert (uses real lookup unless we inject later).
    url = await assertUrlSafeForFetch(urlString);
  } catch {
    previewCache.set(urlString, {
      expiresAt: now + CHAT_LINK_PREVIEW_CACHE_TTL_MS,
      preview: null,
    });
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_LINK_PREVIEW_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "user-agent": "BacksterOS-LinkPreview/1.0",
      },
    });
    if (!response.ok) {
      previewCache.set(urlString, {
        expiresAt: now + CHAT_LINK_PREVIEW_CACHE_TTL_MS,
        preview: null,
      });
      return null;
    }
    // Re-validate final URL after redirects.
    try {
      await assertUrlSafeForFetch(response.url || url.toString());
    } catch {
      previewCache.set(urlString, {
        expiresAt: now + CHAT_LINK_PREVIEW_CACHE_TTL_MS,
        preview: null,
      });
      return null;
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      previewCache.set(urlString, {
        expiresAt: now + CHAT_LINK_PREVIEW_CACHE_TTL_MS,
        preview: null,
      });
      return null;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      const clipped = text.slice(0, CHAT_LINK_PREVIEW_MAX_BYTES);
      const preview = parseHtmlPreview(new URL(response.url || url.toString()), clipped);
      previewCache.set(urlString, {
        expiresAt: now + CHAT_LINK_PREVIEW_CACHE_TTL_MS,
        preview,
      });
      return preview;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > CHAT_LINK_PREVIEW_MAX_BYTES) {
        chunks.push(value.slice(0, Math.max(0, CHAT_LINK_PREVIEW_MAX_BYTES - (total - value.byteLength))));
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        break;
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    const preview = parseHtmlPreview(new URL(response.url || url.toString()), html);
    previewCache.set(urlString, {
      expiresAt: now + CHAT_LINK_PREVIEW_CACHE_TTL_MS,
      preview,
    });
    return preview;
  } catch {
    previewCache.set(urlString, {
      expiresAt: now + CHAT_LINK_PREVIEW_CACHE_TTL_MS,
      preview: null,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch previews for URLs in message body (capped). Failures become omissions. */
export async function resolveChatLinkPreviews(
  body: string,
  options?: { skip?: boolean } & FetchLinkPreviewDeps,
): Promise<ChatThreadLinkPreview[]> {
  if (options?.skip) return [];
  const urls = extractHttpUrls(body);
  if (urls.length === 0) return [];
  const results = await Promise.all(
    urls.map((url) => fetchOnePreview(url, options)),
  );
  return results.filter((p): p is ChatThreadLinkPreview => p != null);
}

/** Test helper. */
export function clearChatLinkPreviewCache(): void {
  previewCache.clear();
}
