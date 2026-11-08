/**
 * Public client portal origin for outbound staff → portal hooks
 * (invite, password reset, meeting / invoice emails).
 *
 * Never fall back to localhost — that makes the portal bake unreachable
 * asset URLs (logos) into Resend mail when the hook is reached at all.
 */

export const DEFAULT_CLIENT_PORTAL_URL = "https://client.lemo-design.com";

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

/**
 * Resolve the portal base URL for server-to-server mail hooks.
 * Order: CLIENT_PORTAL_URL → PORTAL_PUBLIC_URL → production canonical.
 * Loopback values are ignored so misconfigured local env cannot ship
 * localhost logo URLs in customer email.
 */
export function resolveClientPortalBaseUrl(): string {
  const raw =
    process.env.CLIENT_PORTAL_URL?.trim() ||
    process.env.PORTAL_PUBLIC_URL?.trim() ||
    "";
  const candidate = (raw || DEFAULT_CLIENT_PORTAL_URL).replace(/\/$/, "");
  try {
    const hostname = new URL(candidate).hostname;
    if (isLoopbackHostname(hostname)) {
      console.warn(
        `[portal] ignoring loopback CLIENT_PORTAL_URL (${candidate}); using ${DEFAULT_CLIENT_PORTAL_URL}`,
      );
      return DEFAULT_CLIENT_PORTAL_URL;
    }
    return candidate;
  } catch {
    return DEFAULT_CLIENT_PORTAL_URL;
  }
}
