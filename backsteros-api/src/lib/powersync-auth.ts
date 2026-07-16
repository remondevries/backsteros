import { SignJWT } from "jose";

export function getPowerSyncAudience(): string {
  return process.env.POWERSYNC_AUDIENCE ?? "backsteros-powersync";
}

export function getPowerSyncUrl(): string | null {
  return process.env.POWERSYNC_URL ?? null;
}

export async function signPowerSyncToken(
  subject: string,
  workspaceId: string,
): Promise<string> {
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
