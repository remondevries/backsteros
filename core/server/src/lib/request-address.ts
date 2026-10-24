import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

/**
 * Normalize for trust comparisons: trim, lower-case, strip IPv4-mapped IPv6
 * (`::ffff:203.0.113.10` → `203.0.113.10`).
 */
export function normalizeIpAddress(
  address: string | null | undefined,
): string | null {
  if (!address) return null;
  const trimmed = address.trim().toLowerCase();
  if (!trimmed) return null;
  const mapped = trimmed.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  return mapped ? mapped[1]! : trimmed;
}

/**
 * Socket peers that may set client IP via proxy headers (Caddy / Cloudflare /
 * Tailscale serve on loopback). Comma-separated extras via TRUSTED_PROXY_IPS.
 *
 * Extras must be the TCP peer as Node sees it (often the Docker bridge gateway
 * in front of a published port — e.g. `172.20.0.1` — not the proxy's address on
 * a different compose network).
 */
function trustedProxyIps(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  const extras = (env.TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((value) => normalizeIpAddress(value))
    .filter((value): value is string => Boolean(value));
  return new Set([
    "127.0.0.1",
    "::1",
    ...extras,
  ]);
}

export function isTrustedProxyRemoteAddress(
  address: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const normalized = normalizeIpAddress(address);
  if (!normalized) return false;
  return trustedProxyIps(env).has(normalized);
}

/** Test-only override for the TCP peer seen by {@link requestClientAddress}. */
let socketRemoteAddressOverrideForTests: string | null | undefined;

/** When set (including `null`), skips {@link getConnInfo} for lifecycle tests. */
export function setSocketRemoteAddressOverrideForTests(
  address: string | null | undefined,
): void {
  socketRemoteAddressOverrideForTests = address;
}

function socketRemoteAddress(c: Context): string | null {
  if (socketRemoteAddressOverrideForTests !== undefined) {
    return socketRemoteAddressOverrideForTests;
  }
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
