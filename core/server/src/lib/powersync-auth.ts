import { SignJWT } from "jose";

import type { AuthContext } from "../middleware/auth.js";
import { hasScope } from "./crypto.js";
import { assertPowerSyncSecrets } from "./secrets.js";

export function getPowerSyncAudience(): string {
  return process.env.POWERSYNC_AUDIENCE ?? "backsteros-powersync";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Tailnet names Caddy serves for this Mac. Not a loopback client. */
export const DEV_GATEWAY_HOST_SUFFIX = ".local.backsteros.com";
export const DEV_GATEWAY_SYNC_URL = "https://sync.local.backsteros.com";

export function isDevGatewayHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  return host === "local.backsteros.com" || host.endsWith(DEV_GATEWAY_HOST_SUFFIX);
}

export function isDevGatewayOrigin(origin: string | null | undefined): boolean {
  if (!origin?.trim()) return false;
  try {
    return isDevGatewayHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** Tauri dev (`localhost:1420`) and packaged shell origins. */
export function isDesktopShellOrigin(origin: string | null | undefined): boolean {
  if (!origin?.trim()) return false;
  const value = origin.trim().toLowerCase();
  return (
    value.startsWith("tauri://") ||
    value === "http://tauri.localhost" ||
    value === "https://tauri.localhost" ||
    value === "http://localhost:1420" ||
    value === "http://127.0.0.1:1420"
  );
}

export function isCloudCoreRole(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud";
}

/**
 * Who may download the workspace into a PowerSync client.
 * Local-shell on local-core, or an owner API key (`settings:write` + `tasks:write`).
 */
export function canMintPowerSyncToken(auth: AuthContext | null): boolean {
  if (!auth?.workspaceId) return false;
  if (auth.kind === "local_shell") {
    return Boolean(auth.userId || auth.clerkUserId);
  }
  if (auth.kind === "api_key") {
    return (
      Boolean(auth.userId) &&
      hasScope(auth.scopes, "settings:write") &&
      hasScope(auth.scopes, "tasks:write")
    );
  }
  return false;
}

/**
 * Prefer loopback PowerSync for desktop Tauri / local Vite **on local-core**.
 * Cloud-core must not do this: the product shell syncs to cloud PowerSync,
 * and loopback on the VPS is not a client endpoint.
 * WKWebView used to fail Tailscale hostnames; the tailnet IP is the client URL.
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

  // Product shells talk to cloud PowerSync. Do not rewrite Tauri to loopback.
  if (isCloudCoreRole()) {
    if (!publicUrl) return null;
    return stripTrailingSlash(publicUrl);
  }

  if (
    request &&
    (isDevGatewayOrigin(request.origin) ||
      (request.host ? isDevGatewayHostname(request.host) : false))
  ) {
    return DEV_GATEWAY_SYNC_URL;
  }

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
