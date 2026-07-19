import { SignJWT } from "jose";

import { assertPowerSyncSecrets } from "./secrets.js";

export function getPowerSyncAudience(): string {
  return process.env.POWERSYNC_AUDIENCE ?? "backsteros-powersync";
}

export function getPowerSyncUrl(): string | null {
  const value = process.env.POWERSYNC_URL?.trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
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
