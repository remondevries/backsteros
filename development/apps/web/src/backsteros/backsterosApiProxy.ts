/**
 * Same-origin `/backsteros-api` proxy (Vite / T3 server / Electron) is how the
 * browser avoids CORS. Settings keep a "local" sentinel URL for that path;
 * the Mac HTTPS gateway is also proxy-eligible when someone pastes it into
 * Settings without a browser-held API key.
 */

export const DEFAULT_BACKSTEROS_API_URL = "http://127.0.0.1:8788";

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
