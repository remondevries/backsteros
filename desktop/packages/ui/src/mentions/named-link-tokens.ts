import {
  coerceSparkEmailUrl,
  isSparkEmailTaskLinkUrl,
} from "../components/tasks/task-link-attachments.js";

/**
 * Spark-style named links pasted into markdown:
 * `[readdle-spark://bl=…|Figma]` or `[https://example.com|Docs]`.
 *
 * Left side = URL, right side = display label (pipe-separated).
 */
export type ParsedNamedLinkToken = {
  url: string;
  label: string;
  raw: string;
  kind: "spark-email" | "url";
};

/** Bracketed `[url|label]` — excludes `@` mentions (`[@task:…]`). */
export const NAMED_LINK_TOKEN_RE =
  /\[(?!@)([^\]\|\r\n]+)\|([^\]\r\n]+)\]/g;

const NAMED_LINK_TOKEN_SINGLE_RE =
  /^\[(?!@)([^\]\|\r\n]+)\|([^\]\r\n]+)\]$/;

const MAX_NAMED_LINK_URL_LENGTH = 2000;

/**
 * Normalize the URL half of a named-link token.
 * Accepts Spark deep links, in-app paths, and http(s).
 */
export function normalizeNamedLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_NAMED_LINK_URL_LENGTH) {
    return null;
  }

  const spark = coerceSparkEmailUrl(trimmed);
  if (spark) {
    return spark;
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function parseNamedLinkToken(raw: string): ParsedNamedLinkToken | null {
  const match = NAMED_LINK_TOKEN_SINGLE_RE.exec(raw.trim());
  if (!match) {
    return null;
  }

  const urlRaw = match[1]?.trim() ?? "";
  const label = match[2]?.trim() ?? "";
  if (!urlRaw || !label) {
    return null;
  }

  const url = normalizeNamedLinkUrl(urlRaw);
  if (!url) {
    return null;
  }

  return {
    url,
    label,
    raw: raw.trim(),
    kind: isSparkEmailTaskLinkUrl(url) ? "spark-email" : "url",
  };
}

export function faviconHostForNamedLinkUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return host || null;
  } catch {
    return null;
  }
}
