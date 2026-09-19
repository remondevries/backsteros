function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim().replace(/\/$/, "");
}

/** Default local core origin (optional replica — not the product shell). */
export const LOCAL_CORE_API_URL = "http://127.0.0.1:8788";

/** Product desktop API. Caddy HTTPS gateway to cloud-core. Override with VITE_API_URL. */
export const CLOUD_CORE_API_URL = "https://api.local.backsteros.com";

/** Product PowerSync stream. Cleartext tailnet/loopback endpoints are rewritten here. */
export const CLOUD_SYNC_URL = "https://sync.local.backsteros.com";

/**
 * HTTP/1.1 browsers cap ~6 connections per host. Desktop keeps several SSE
 * streams open (workspace / email / agent-presence). Point those at the
 * alternate loopback hostname so REST on `127.0.0.1` keeps free slots.
 */
const DEV_GATEWAY_SUFFIX = ".local.backsteros.com";

function isDevGatewayHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return host === "local.backsteros.com" || host.endsWith(DEV_GATEWAY_SUFFIX);
}

/** When the page itself was opened on the tailnet name, talk to that gateway. */
function devGatewayApiUrl(): string | null {
  if (typeof window === "undefined") return null;
  if (!isDevGatewayHostname(window.location.hostname)) return null;
  return "https://api.local.backsteros.com";
}

export function sseUrlForApiUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      return url.toString().replace(/\/$/, "");
    }
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      return url.toString().replace(/\/$/, "");
    }
    if (url.hostname === "api.local.backsteros.com") {
      url.hostname = "sse.local.backsteros.com";
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    // fall through
  }
  return apiUrl.replace(/\/$/, "");
}

export type DesktopPublicEnvironment = {
  apiUrl: string;
  appUrl: string;
};

/**
 * Product API URL. An explicit loopback URL stays (optional replica).
 * Cleartext Tailscale (`100.*`) is the old fallback and is sent through the HTTPS gateway.
 */
export function resolveDesktopApiUrl(
  configured: string | null | undefined,
): string {
  const raw = (configured?.trim() || CLOUD_CORE_API_URL).replace(/\/$/, "");
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" && url.hostname.startsWith("100.")) {
      return CLOUD_CORE_API_URL;
    }
  } catch {
    return CLOUD_CORE_API_URL;
  }
  return raw;
}

/**
 * WKWebView blocks cleartext sync. Tailnet `100.*` and loopback PowerSync
 * both become the Caddy HTTPS gateway, including when the page is
 * `http://localhost:1420` (tauri dev).
 */
export function rewritePowerSyncEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    const cleartextCloud =
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname.startsWith("100."));
    if (cleartextCloud) return CLOUD_SYNC_URL;
  } catch {
    // keep original
  }
  return trimmed;
}

/** Soft read for the product shell (local-shell auth). */
export function getDesktopPublicEnvironment(): DesktopPublicEnvironment {
  const apiUrl = resolveDesktopApiUrl(
    devGatewayApiUrl() ?? import.meta.env.VITE_API_URL ?? CLOUD_CORE_API_URL,
  );
  const appUrl = (import.meta.env.VITE_APP_URL ?? "")
    .trim()
    .replace(/\/$/, "");

  return { apiUrl, appUrl };
}

export function requireDesktopPublicEnvironment(): DesktopPublicEnvironment {
  return {
    apiUrl: resolveDesktopApiUrl(
      required("VITE_API_URL", import.meta.env.VITE_API_URL),
    ),
    appUrl: (import.meta.env.VITE_APP_URL ?? "").trim().replace(/\/$/, ""),
  };
}
