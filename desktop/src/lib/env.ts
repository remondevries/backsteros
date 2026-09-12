function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim().replace(/\/$/, "");
}

/** Default local core origin (v2 — never production). */
export const LOCAL_CORE_API_URL = "http://127.0.0.1:8788";

/**
 * HTTP/1.1 browsers cap ~6 connections per host. Desktop keeps several SSE
 * streams open (workspace / email / agent-presence). Point those at the
 * alternate loopback hostname so REST on `127.0.0.1` keeps free slots.
 */
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
  } catch {
    // fall through
  }
  return apiUrl.replace(/\/$/, "");
}

export type DesktopPublicEnvironment = {
  apiUrl: string;
  appUrl: string;
};

/** Soft read for the product shell (local-shell auth). */
export function getDesktopPublicEnvironment(): DesktopPublicEnvironment {
  const apiUrl = (import.meta.env.VITE_API_URL ?? LOCAL_CORE_API_URL)
    .trim()
    .replace(/\/$/, "");
  const appUrl = (import.meta.env.VITE_APP_URL ?? "")
    .trim()
    .replace(/\/$/, "");

  return { apiUrl, appUrl };
}

export function requireDesktopPublicEnvironment(): DesktopPublicEnvironment {
  return {
    apiUrl: required("VITE_API_URL", import.meta.env.VITE_API_URL),
    appUrl: (import.meta.env.VITE_APP_URL ?? "").trim().replace(/\/$/, ""),
  };
}
