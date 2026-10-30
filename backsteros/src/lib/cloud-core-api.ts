import { loadDesktopOwnerToken } from "./local-shell-auth";

/**
 * Public HTTPS door → cloud-core (always-on write leader).
 * Timer chrome polls and posts here so OS / DESIGN / DEV share one list.
 */
export const CLOUD_CORE_PUBLIC_API_URL = "https://agent.backsteros.com";

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
 * REST against cloud-core with the owner `sk_live_…` key.
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
  const res = await fetch(`${trimSlash(CLOUD_CORE_PUBLIC_API_URL)}${normalized}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
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
