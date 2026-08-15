import { SignJWT } from "jose";

import { assertPowerSyncSecrets } from "./secrets.js";

export function getPowerSyncAudience(): string {
  return process.env.POWERSYNC_AUDIENCE ?? "backsteros-powersync";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Prefer loopback PowerSync for desktop Tauri / local Vite.
 * WKWebView often never opens a sync stream to a Tailscale hostname even when
 * REST to core works — mobile over Tailscale still needs POWERSYNC_URL.
 */
export function preferLocalPowerSyncEndpoint(input: {
  origin?: string | null;
  host?: string | null;
}): boolean {
  const origin = (input.origin ?? "").trim().toLowerCase();
  const host = (input.host ?? "").trim().toLowerCase();
  if (
    origin.startsWith("tauri://") ||
    origin.includes("://tauri.localhost") ||
    origin.includes("://localhost:") ||
    origin.includes("://127.0.0.1:")
  ) {
    return true;
  }
  if (
    host === "localhost" ||
    host.startsWith("localhost:") ||
    host === "127.0.0.1" ||
    host.startsWith("127.0.0.1:")
  ) {
    return true;
  }
  return false;
}

export function getPowerSyncUrl(request?: {
  origin?: string | null;
  host?: string | null;
}): string | null {
  const publicUrl = process.env.POWERSYNC_URL?.trim();
  const localUrl =
    process.env.POWERSYNC_LOCAL_URL?.trim() || "http://127.0.0.1:8080";

  if (request && preferLocalPowerSyncEndpoint(request)) {
    return stripTrailingSlash(localUrl);
  }

  if (!publicUrl) return null;
  return stripTrailingSlash(publicUrl);
}

export async function signPowerSyncToken(
  subject: string,
  workspaceId: string,
): Promise<string> {
  assertPowerSyncSecrets();
  const secret = process.env.POWERSYNC_JWT_SECRET;
  if (!secret) {
    throw new Error("POWERSYNC_JWT_SECRET is required");
  }

  return new SignJWT({ workspace_id: workspaceId })
    .setProtectedHeader({ alg: "HS256", kid: "backsteros-powersync-1" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("10m")
    .setAudience(getPowerSyncAudience())
    .sign(new TextEncoder().encode(secret));
}
