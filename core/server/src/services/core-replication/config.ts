import { AGENTS_DOOR_HOSTNAMES } from "./constants.js";

export type CoreReplicationRole = "local" | "cloud";

export type CoreReplicationConfig = {
  peerUrl: string;
  secret: string;
  role: CoreReplicationRole;
};

export class InvalidReplicationPeerUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReplicationPeerUrlError";
  }
}

/** Peer must be the other core directly — never the public agents HTTPS door. */
export function validateReplicationPeerUrl(
  peerUrl: string,
): { peerUrl: string; hostname: string } {
  let parsed: URL;
  try {
    parsed = new URL(peerUrl);
  } catch {
    throw new InvalidReplicationPeerUrlError(
      "CORE_REPLICATION_PEER_URL must be a valid URL pointing at the other core (Tailscale MagicDNS or localhost).",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if ((AGENTS_DOOR_HOSTNAMES as readonly string[]).includes(hostname)) {
    throw new InvalidReplicationPeerUrlError(
      `CORE_REPLICATION_PEER_URL must not point at the agents HTTPS door (${hostname}). ` +
        "Use the other core directly, e.g. http://macbook.tail1234.ts.net:8788 or http://127.0.0.1:8788.",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidReplicationPeerUrlError(
      "CORE_REPLICATION_PEER_URL must use http or https.",
    );
  }

  return {
    peerUrl: peerUrl.replace(/\/$/, ""),
    hostname,
  };
}

export function getCoreReplicationConfig(
  env: NodeJS.ProcessEnv = process.env,
): CoreReplicationConfig | null {
  const peerUrlRaw = env.CORE_REPLICATION_PEER_URL?.trim();
  const secret = env.CORE_REPLICATION_SECRET?.trim();
  if (!peerUrlRaw || !secret) {
    return null;
  }

  const { peerUrl } = validateReplicationPeerUrl(peerUrlRaw);
  const roleRaw = env.CORE_REPLICATION_ROLE?.trim().toLowerCase();
  const role: CoreReplicationRole =
    roleRaw === "cloud" ? "cloud" : "local";

  return { peerUrl, secret, role };
}

export function isCoreReplicationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getCoreReplicationConfig(env) !== null;
}

/**
 * Cloud-core must not expose :8788 on 0.0.0.0 while replication is enabled —
 * /internal/* routes are Bearer-protected but must stay on loopback/Tailscale.
 */
export function assertReplicationListenHost(
  host: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isCoreReplicationEnabled(env)) {
    return;
  }
  const normalized = host.trim().toLowerCase();
  if (normalized === "0.0.0.0" || normalized === "::") {
    throw new Error(
      "CORE_REPLICATION is enabled but the server is bound to all interfaces. " +
        "Set HOST=127.0.0.1 (or a Tailscale address) so /internal/core-replication routes are not public.",
    );
  }
}
