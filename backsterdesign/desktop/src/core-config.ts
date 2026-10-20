/** Cloud-core URL for DESIGN chrome timers + task API (same leader as OS / DEV). */
export type CoreConfig = {
  baseUrl: string;
  apiKey: string;
};

/** Public HTTPS door → cloud-core. */
export const CLOUD_CORE_PUBLIC_API_URL = "https://agent.backsteros.com";

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function readCoreConfig(): CoreConfig {
  const baseUrl = trimSlash(
    (import.meta.env.VITE_BACKSTEROS_CORE_URL as string | undefined)?.trim() ||
      CLOUD_CORE_PUBLIC_API_URL,
  );
  const apiKey =
    (import.meta.env.VITE_BACKSTEROS_API_KEY as string | undefined)?.trim() ||
    "";
  return { baseUrl, apiKey };
}

export async function coreRequestJson<T>(
  config: CoreConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!config.apiKey.startsWith("sk_live_")) {
    throw new Error(
      "Set VITE_BACKSTEROS_API_KEY (sk_live_…) for cloud-core timer sync",
    );
  }
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${body || res.statusText}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
