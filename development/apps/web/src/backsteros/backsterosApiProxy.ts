/**
 * Same-origin proxies (Vite / T3 server / Electron) avoid CORS:
 * - `/backsteros-api` → product / gateway (`BACKSTEROS_API_URL`)
 * - `/backsteros-local-core` → Mac local-core (`BACKSTEROS_LOCAL_CORE_URL`, default :8788)
 *
 * Settings keep a loopback sentinel for those paths; the Mac HTTPS gateway is
 * also proxy-eligible for the product API when pasted without a browser-held key.
 *
 * BDV-37: product (tasks / GitHub) and local-core (Files / Documents FS) must
 * not share one upstream — cloud cannot realpath Mac working copies.
 */

export const DEFAULT_BACKSTEROS_API_URL = "http://127.0.0.1:8788";

/** Default origin for Files / Documents (`/fs/*`, `/docs`) — Mac working copy. */
export const DEFAULT_BACKSTEROS_LOCAL_CORE_URL = "http://127.0.0.1:8788";

/** Same-origin prefix for product / gateway proxy. */
export const BACKSTEROS_API_PROXY_PATH = "/backsteros-api";

/** Same-origin prefix for local-core (Files / Documents) proxy. */
export const BACKSTEROS_LOCAL_CORE_PROXY_PATH = "/backsteros-local-core";

const GATEWAY_HOSTS = new Set(["api.local.backsteros.com"]);

export function isBacksterosApiProxyUrl(apiUrl: string): boolean {
  try {
    const url = new URL(apiUrl.trim());
    const host = url.hostname.toLowerCase();
    if (GATEWAY_HOSTS.has(host)) return true;
    return (
      (host === "127.0.0.1" || host === "localhost") && (url.port === "8788" || url.port === "")
    );
  } catch {
    return false;
  }
}

/** Loopback local-core sentinel — uses `/backsteros-local-core`, never the product proxy. */
export function isBacksterosLocalCoreProxyUrl(apiUrl: string): boolean {
  try {
    const url = new URL(apiUrl.trim());
    const host = url.hostname.toLowerCase();
    return (
      (host === "127.0.0.1" || host === "localhost") && (url.port === "8788" || url.port === "")
    );
  } catch {
    return false;
  }
}

/** Persist the local sentinel for gateway URLs so Settings stay CORS-safe. */
export function normalizePersistedBacksterosApiUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim();
  if (!trimmed) return DEFAULT_BACKSTEROS_API_URL;
  try {
    const url = new URL(trimmed);
    if (GATEWAY_HOSTS.has(url.hostname.toLowerCase())) {
      return DEFAULT_BACKSTEROS_API_URL;
    }
  } catch {
    return DEFAULT_BACKSTEROS_API_URL;
  }
  return trimmed;
}

/** Normalize local-core origin; empty → default loopback. */
export function normalizePersistedBacksterosLocalCoreUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim();
  if (!trimmed) return DEFAULT_BACKSTEROS_LOCAL_CORE_URL;
  try {
    const url = new URL(trimmed);
    if (GATEWAY_HOSTS.has(url.hostname.toLowerCase())) {
      return DEFAULT_BACKSTEROS_LOCAL_CORE_URL;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_BACKSTEROS_LOCAL_CORE_URL;
  }
}

/**
 * Paths that must hit local-core (working-copy FS), never the cloud product API.
 * Matches `/api/v1/projects/:id/fs/...` and `/api/v1/projects/:id/docs`.
 */
export function isBacksterosLocalCorePath(pathWithQuery: string): boolean {
  const pathOnly = pathWithQuery.split(/[?#]/, 1)[0] ?? pathWithQuery;
  return /^\/api\/v1\/projects\/[^/]+\/(fs(?:\/|$)|docs$)/.test(pathOnly);
}

/** User-facing copy when local-core cannot serve Files / Documents. */
export function formatBacksterosLocalCoreError(error: unknown): string {
  const message =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  const lower = message.toLowerCase();
  if (
    lower.includes("working directory was not found") ||
    lower.includes("no local working directory") ||
    lower.includes("fs_working_directory_missing")
  ) {
    return "Local-core cannot see this project's working directory on this Mac. Confirm local-core is running and the folder chip path exists on this machine.";
  }
  if (
    lower.includes("unreachable") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("network request failed")
  ) {
    return "Local-core is unreachable. Start local-core (or the Mac API gateway) to browse Files and Documents — the product API cannot read this Mac's disk.";
  }
  if (
    lower.includes("internal server error") ||
    lower.includes("internal_error") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    return "Local-core is up but cannot read the project database (Postgres on :5433). Start the local replica (Hub → Docker, or `docker compose up -d postgres`) so Files and Documents can list this Mac's working copy.";
  }
  if (message) return message;
  return "Local-core is unavailable for Files and Documents.";
}
