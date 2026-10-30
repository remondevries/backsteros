import { loadDesktopOwnerToken } from "./local-shell-auth";

/**
 * Public HTTPS door → cloud-core (always-on write leader).
 * Timer chrome polls and posts here so OS / DESIGN / DEV share one list.
 */
export const CLOUD_CORE_PUBLIC_API_URL = "https://agent.backsteros.com";

/**
 * Vite same-origin prefix → agents door. Avoids Firefox/Zen NetworkError when
 * cloud responds with `cross-origin-resource-policy: same-origin`.
 */
export const CLOUD_CORE_VITE_PROXY_PREFIX = "/__cloud_core__";

export class CloudCoreApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CloudCoreApiError";
    this.status = status;
  }
}

export function isCloudCoreApiError(error: unknown): error is CloudCoreApiError {
  return error instanceof CloudCoreApiError;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Base URL for {@link cloudCoreRequestJson}.
 * In Vite on :1420/:1421, use the same-origin proxy (see vite.config).
 */
export function cloudCoreApiBaseUrl(options?: {
  pageOrigin?: string | null;
  viteDev?: boolean;
}): string {
  const viteDev =
    options?.viteDev ??
    Boolean(
      typeof import.meta !== "undefined" &&
        (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV,
    );
  const pageOrigin =
    options?.pageOrigin !== undefined
      ? options.pageOrigin
      : typeof window !== "undefined"
        ? window.location.origin
        : null;

  if (viteDev && pageOrigin) {
    try {
      const page = new URL(pageOrigin);
      if (page.port === "1420" || page.port === "1421") {
        return `${trimSlash(pageOrigin)}${CLOUD_CORE_VITE_PROXY_PREFIX}`;
      }
    } catch {
      // fall through
    }
  }
  return CLOUD_CORE_PUBLIC_API_URL;
}

/**
 * REST against cloud-core with the owner `sk_live_…` / `sk_access_…` key.
 * Does not use the desktop product `apiUrl` (often local-core :8788).
 */
export async function cloudCoreRequestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await loadDesktopOwnerToken();
  if (!token) {
    throw new CloudCoreApiError(
      401,
      "Owner API key required for cloud-core (agent.backsteros.com)",
    );
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = `${trimSlash(cloudCoreApiBaseUrl())}${normalized}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Network error talking to cloud-core";
    throw new CloudCoreApiError(0, message);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CloudCoreApiError(
      res.status,
      `${res.status} ${body || res.statusText}`,
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Streaming GET against cloud-core (SSE) with the owner API key.
 * Used for shell agent DM push (`/api/v1/chat/threads/events`).
 */
export async function cloudCoreRequestStream(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await loadDesktopOwnerToken();
  if (!token) {
    throw new CloudCoreApiError(
      401,
      "Owner API key required for cloud-core (agent.backsteros.com)",
    );
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = `${trimSlash(cloudCoreApiBaseUrl())}${normalized}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Network error talking to cloud-core";
    throw new CloudCoreApiError(0, message);
  }
  return res;
}
