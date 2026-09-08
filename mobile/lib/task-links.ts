import type { TaskLink } from "@backsteros/contracts";

const MAX_TASK_LINK_URL_LENGTH = 2000;
export const MAX_TASK_LINKS = 20;

/**
 * Coerce pasted / stored Spark deep links into a canonical `readdle-spark://…`
 * form. Also recovers URLs that were wrongly prefixed with https://.
 */
export function coerceSparkEmailUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_TASK_LINK_URL_LENGTH) {
    return null;
  }

  const httpsCollapsed = trimmed.match(/^https?:\/\/readdle-spark\/+(.*)$/i);
  if (httpsCollapsed) {
    return `readdle-spark://${httpsCollapsed[1]}`;
  }

  const httpsWrapped = trimmed.match(/^https?:\/\/(readdle-spark:\/.*)$/i);
  if (httpsWrapped) {
    return httpsWrapped[1].replace(
      /^readdle-spark:\/(?!\/)/i,
      "readdle-spark://",
    );
  }

  if (/^readdle-spark:/i.test(trimmed)) {
    return trimmed.replace(/^readdle-spark:\/?\/?/i, "readdle-spark://");
  }

  return null;
}

export function normalizeTaskLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_TASK_LINK_URL_LENGTH) return null;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  const spark = coerceSparkEmailUrl(trimmed);
  if (spark) {
    try {
      const url = new URL(spark);
      if (url.protocol.toLowerCase() !== "readdle-spark:") return null;
      return spark;
    } catch {
      return null;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isSparkEmailTaskLinkUrl(url: string): boolean {
  return coerceSparkEmailUrl(url) != null;
}

export function isAppEmailTaskLinkUrl(url: string): boolean {
  return /^\/email\//i.test(url.trim());
}

export function isAppDocumentTaskLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    /^\/knowledge\//i.test(trimmed) ||
    /^\/document\//i.test(trimmed) ||
    /\/documents\//i.test(trimmed)
  );
}

export function isAppLetterTaskLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  if (/^\/letter\//i.test(trimmed)) return true;
  return /(?:^|\/)letters(?:-v2)?\/([^/?#]+)/i.test(trimmed);
}

export function isGithubTaskLinkUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "github.com" || host.endsWith(".github.com");
  } catch {
    return false;
  }
}

export function taskLinkDisplayLabel(url: string): string {
  if (isSparkEmailTaskLinkUrl(url) || isAppEmailTaskLinkUrl(url)) {
    return "E-mail";
  }
  if (isAppLetterTaskLinkUrl(url)) {
    return "Letter";
  }
  if (isAppDocumentTaskLinkUrl(url)) {
    try {
      const parts = url.split("/").filter(Boolean);
      const last = parts[parts.length - 1] ?? "Document";
      return decodeURIComponent(last);
    } catch {
      return "Document";
    }
  }
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

export function createTaskLinkId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `link_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Parse PowerSync / API `links` column into TaskLink[]. */
export function parseTaskLinks(value: unknown): TaskLink[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      raw = JSON.parse(trimmed) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is TaskLink =>
      item != null &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { url?: unknown }).url === "string" &&
      typeof (item as { createdAt?: unknown }).createdAt === "string",
  );
}
