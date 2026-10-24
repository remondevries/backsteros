import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

/**
 * Socket peers that may set client IP via proxy headers (Caddy / Cloudflare /
 * Tailscale serve on loopback). Comma-separated extras via TRUSTED_PROXY_IPS.
 */
function trustedProxyIps(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  const extras = (env.TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set([
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    ...extras,
  ]);
}

export function isTrustedProxyRemoteAddress(
  address: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!address) return false;
  return trustedProxyIps(env).has(address.trim().toLowerCase());
}

function socketRemoteAddress(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

function forwardedClientAddress(c: Context): string | null {
  const forwarded =
    c.req.header("cf-connecting-ip")?.trim() ||
    c.req.header("x-real-ip")?.trim() ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  return forwarded || null;
}

/**
 * Best-effort client address for API key last-used / audit.
 * Proxy headers (cf-connecting-ip / x-forwarded-for / x-real-ip) are only
 * trusted when the TCP peer is a configured trusted proxy; otherwise use the
 * socket address so clients cannot spoof usage IPs.
 */
export function requestClientAddress(c: Context): string | null {
  const peer = socketRemoteAddress(c);
  if (isTrustedProxyRemoteAddress(peer)) {
    return forwardedClientAddress(c) ?? peer;
  }
  return peer;
}
