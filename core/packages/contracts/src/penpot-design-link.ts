/**
 * Parse / coerce Penpot (BacksterDESIGN) workspace URLs into a stable
 * internal URI and structured ids for task linking.
 *
 * Stored form: `backsterdesign://workspace?file-id=…&page-id=…&board-id=…&team-id=…`
 * Openable form: `{publicUri}/#/workspace?file-id=…&…` (local devenv or hosted).
 *
 * Public portal host (`design.lemo-design.com`) is reserved for later.
 */

const DESIGN_SCHEME = "backsterdesign:";
const DESIGN_HOST = "workspace";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hosts treated as BacksterDESIGN / Penpot (staff / local). */
const INTERNAL_DESIGN_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

export type PenpotDesignLinkParts = {
  fileId: string;
  pageId?: string | null;
  /** Selected board / frame id (Penpot `board-id` query). */
  boardId?: string | null;
  teamId?: string | null;
  /** Legacy path project id when present. */
  projectId?: string | null;
};

export type PenpotDesignLink = PenpotDesignLinkParts & {
  /** Canonical internal URI for storage on task.links. */
  uri: string;
};

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

function firstQueryValue(
  params: URLSearchParams,
  key: string,
): string | null {
  const raw = params.get(key);
  if (raw == null || raw === "") return null;
  // Penpot may repeat board-id; take the first.
  return raw.split(",")[0]?.trim() || null;
}

function isInternalDesignHost(hostname: string, port: string): boolean {
  const host = hostname.toLowerCase();
  if (INTERNAL_DESIGN_HOSTS.has(host)) {
    // Local devenv defaults to 3449; also accept bare localhost during tests.
    if (!port || port === "3449" || port === "3450" || port === "") {
      return true;
    }
  }
  // Staff-facing hosted instances (not the public client portal yet).
  if (host === "design.lemo-design.com" || host.endsWith(".lemo-design.com")) {
    return host.startsWith("design.") || host === "design.lemo-design.com";
  }
  return false;
}

/**
 * True when `url` is already a `backsterdesign://workspace?…` URI.
 */
export function isBacksterDesignUri(url: string): boolean {
  const trimmed = url.trim();
  return /^backsterdesign:\/\//i.test(trimmed);
}

/**
 * Build the canonical internal URI from structured ids.
 */
export function buildBacksterDesignUri(parts: PenpotDesignLinkParts): string {
  const params = new URLSearchParams();
  params.set("file-id", parts.fileId);
  if (isUuid(parts.pageId)) params.set("page-id", parts.pageId);
  if (isUuid(parts.boardId)) params.set("board-id", parts.boardId);
  if (isUuid(parts.teamId)) params.set("team-id", parts.teamId);
  if (isUuid(parts.projectId)) params.set("project-id", parts.projectId);
  return `${DESIGN_SCHEME}//${DESIGN_HOST}?${params.toString()}`;
}

/**
 * Resolve a stored design URI (or https Penpot URL) to an https open URL.
 */
export function resolvePenpotDesignOpenUrl(
  raw: string,
  publicUri = "https://localhost:3449",
): string | null {
  const link = parsePenpotDesignLink(raw);
  if (!link) return null;
  const base = publicUri.replace(/\/+$/, "");
  const params = new URLSearchParams();
  params.set("file-id", link.fileId);
  if (link.pageId) params.set("page-id", link.pageId);
  if (link.boardId) params.set("board-id", link.boardId);
  if (link.teamId) params.set("team-id", link.teamId);
  return `${base}/#/workspace?${params.toString()}`;
}

function parseHashWorkspace(
  hash: string,
): { pathIds: string[]; query: URLSearchParams } {
  const withoutHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const [pathPart, queryPart = ""] = withoutHash.split("?");
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const segments = path.split("/").filter(Boolean);
  // ["workspace"] or ["workspace", projectId, fileId]
  const pathIds =
    segments[0] === "workspace" ? segments.slice(1).filter(isUuid) : [];
  return { pathIds, query: new URLSearchParams(queryPart) };
}

/**
 * Parse a pasted Penpot / BacksterDESIGN URL or internal URI.
 * Returns null when the input is not a design workspace link.
 */
export function parsePenpotDesignLink(raw: string): PenpotDesignLink | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return null;

  // Already canonical.
  if (isBacksterDesignUri(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol.toLowerCase() !== DESIGN_SCHEME) return null;
      const host = url.hostname || url.pathname.replace(/^\/*/, "").split("?")[0];
      if (host && host.toLowerCase() !== DESIGN_HOST) return null;
      const fileId = firstQueryValue(url.searchParams, "file-id");
      if (!isUuid(fileId)) return null;
      const parts: PenpotDesignLinkParts = {
        fileId,
        pageId: firstQueryValue(url.searchParams, "page-id"),
        boardId: firstQueryValue(url.searchParams, "board-id"),
        teamId: firstQueryValue(url.searchParams, "team-id"),
        projectId: firstQueryValue(url.searchParams, "project-id"),
      };
      return { ...parts, uri: buildBacksterDesignUri(parts) };
    } catch {
      return null;
    }
  }

  // https://…/#/workspace?file-id=…  or legacy /#/workspace/:project/:file
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate) && !/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (!isInternalDesignHost(url.hostname, url.port)) {
    return null;
  }

  const { pathIds, query: hashQuery } = parseHashWorkspace(url.hash || "");
  // Prefer hash query (SPA); fall back to search params.
  const query = hashQuery.toString() ? hashQuery : url.searchParams;

  let fileId =
    firstQueryValue(query, "file-id") ??
    (pathIds.length >= 2 ? pathIds[1]! : pathIds.length === 1 ? pathIds[0]! : null);
  const projectId =
    firstQueryValue(query, "project-id") ??
    (pathIds.length >= 2 ? pathIds[0]! : null);

  // Path-only `/workspace` without ids is not a linkable item.
  if (!isUuid(fileId)) {
    // Some builds put file-id only in search (non-hash).
    fileId = firstQueryValue(url.searchParams, "file-id");
  }
  if (!isUuid(fileId)) return null;

  const parts: PenpotDesignLinkParts = {
    fileId,
    pageId:
      firstQueryValue(query, "page-id") ??
      firstQueryValue(url.searchParams, "page-id"),
    boardId:
      firstQueryValue(query, "board-id") ??
      firstQueryValue(url.searchParams, "board-id"),
    teamId:
      firstQueryValue(query, "team-id") ??
      firstQueryValue(url.searchParams, "team-id"),
    projectId,
  };

  return { ...parts, uri: buildBacksterDesignUri(parts) };
}

/**
 * Coerce pasted input to the canonical `backsterdesign://…` URI, or null.
 */
export function coercePenpotDesignUrl(raw: string): string | null {
  return parsePenpotDesignLink(raw)?.uri ?? null;
}
