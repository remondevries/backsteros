import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

/**
 * Best-effort client address for API key last-used / audit.
 * Prefer proxy headers when present; fall back to the socket peer.
 */
export function requestClientAddress(c: Context): string | null {
  const forwarded = c.req.header("cf-connecting-ip")
    ?? c.req.header("x-real-ip")
    ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}
