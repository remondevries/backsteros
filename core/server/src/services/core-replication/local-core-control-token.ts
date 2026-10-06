import { randomBytes } from "node:crypto";
import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { extractBearerToken, verifyReplicationSecret } from "./auth.js";
import { getCoreReplicationConfig } from "./config.js";

/**
 * Local-only control credential for desktop → local-core ops that must not be
 * reachable with CORE_REPLICATION_SECRET (Tailscale serve makes peers look like
 * loopback). Never log the token value.
 */

let controlToken: string | null = null;

export function localCoreControlTokenPath(
  home: string = process.env.HOME?.trim() || homedir(),
): string {
  return join(home, ".config/backsteros/local-core-control.token");
}

export function getLocalCoreControlTokenForTests(): string | null {
  return controlToken;
}

export function setLocalCoreControlTokenForTests(token: string | null): void {
  controlToken = token;
}

export function resetLocalCoreControlTokenForTests(): void {
  controlToken = null;
}

export function verifyLocalCoreControlToken(
  provided: string | null | undefined,
): boolean {
  if (!controlToken || !provided) return false;
  return verifyReplicationSecret(provided, controlToken);
}

export function verifyLocalCoreControlAuthorization(
  authorization: string | undefined,
): boolean {
  return verifyLocalCoreControlToken(extractBearerToken(authorization));
}

async function writeControlTokenFile(path: string, token: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  const tmp = join(dir, `.local-core-control.token.tmp-${process.pid}`);
  try {
    await writeFile(tmp, `${token}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, path);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}

/**
 * Generate a fresh token for local-core and persist it for desktop. No-op when
 * replication is unset or role is cloud (cloud must never mint this file).
 */
export async function ensureLocalCoreControlToken(
  home: string = process.env.HOME?.trim() || homedir(),
): Promise<"written" | "skipped"> {
  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    controlToken = null;
    return "skipped";
  }
  const token = randomBytes(32).toString("base64url");
  await writeControlTokenFile(localCoreControlTokenPath(home), token);
  controlToken = token;
  return "written";
}
