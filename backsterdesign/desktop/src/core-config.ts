/** Local-core URL for the Tauri chrome (Penpot uses /backsteros-core proxy). */
export type CoreConfig = {
  baseUrl: string;
  apiKey: string;
};

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function readCoreConfig(): CoreConfig {
  const baseUrl = trimSlash(
    (import.meta.env.VITE_BACKSTEROS_CORE_URL as string | undefined)?.trim() ||
      "http://127.0.0.1:8788",
  );
  const apiKey =
    (import.meta.env.VITE_BACKSTEROS_API_KEY as string | undefined)?.trim() ||
    "local";
  return { baseUrl, apiKey };
}

export async function coreRequestJson<T>(
  config: CoreConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
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
