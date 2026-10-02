function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim().replace(/\/$/, "");
}

/** Local-core API (LaunchAgent / Hub replica on :8788). Product desktop default (OS-73). */
export const LOCAL_CORE_API_URL = "http://127.0.0.1:8788";

/** Legacy Caddy HTTPS gateway to cloud-core. Still used when VITE_API_URL points here. */
export const CLOUD_CORE_API_URL = "https://api.local.backsteros.com";

/** Cloud PowerSync HTTPS gateway (when API is not the local replica). */
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
  return CLOUD_CORE_API_URL;
}

function resolveConfiguredDesktopApiUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return devGatewayApiUrl() ?? LOCAL_CORE_API_URL;
}

/**
 * True when `VITE_API_URL` targets local-core (`:8788`), not the Vite UI on `:1420`.
 */
export function isLocalDevApiUrl(apiUrl: string): boolean {
  try {
    const url = new URL(apiUrl);
    const host = url.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost") return false;
    if (url.port === "1420") return false;
    return true;
  } catch {
    return false;
  }
}

export function sseUrlForApiUrl(apiUrl: string): string {
  if (isLocalDevApiUrl(apiUrl)) {
    return apiUrl.replace(/\/$/, "");
  }
  try {
    const url = new URL(apiUrl);
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
 * Product API URL. Defaults to local-core. Cleartext Tailscale (`100.*`) still
 * goes through the HTTPS gateway. Explicit loopback stays on local-core.
 */
export function resolveDesktopApiUrl(
  configured: string | null | undefined,
): string {
  const raw = (configured?.trim() || LOCAL_CORE_API_URL).replace(/\/$/, "");
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" && url.hostname.startsWith("100.")) {
      return CLOUD_CORE_API_URL;
    }
  } catch {
    return LOCAL_CORE_API_URL;
  }
  return raw;
}

/**
 * WKWebView blocks cleartext sync. With local-core API, keep loopback PowerSync.
 * Tailnet `100.*` cleartext becomes the Caddy HTTPS sync gateway.
 */
export function rewritePowerSyncEndpoint(
  endpoint: string,
  options?: { apiUrl?: string | null },
): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const apiUrl = options?.apiUrl ?? null;
  if (apiUrl && isLocalDevApiUrl(apiUrl)) {
    return trimmed;
  }
  // Product default is local-core — keep loopback PowerSync when API is unset/local.
  if (!apiUrl || apiUrl === LOCAL_CORE_API_URL || isLocalDevApiUrl(apiUrl || "")) {
    try {
      const url = new URL(trimmed);
      if (
        url.protocol === "http:" &&
        (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      ) {
        return trimmed;
      }
    } catch {
      // fall through
    }
  }
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
  const apiUrl = resolveDesktopApiUrl(resolveConfiguredDesktopApiUrl());
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
