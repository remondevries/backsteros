export type CoreReplicationRole = "local" | "cloud";

export type CoreReplicationConfig = {
  peerUrl: string;
  secret: string;
  role: CoreReplicationRole;
};

export function getCoreReplicationConfig(
  env: NodeJS.ProcessEnv = process.env,
): CoreReplicationConfig | null {
  const peerUrl = env.CORE_REPLICATION_PEER_URL?.trim();
  const secret = env.CORE_REPLICATION_SECRET?.trim();
  if (!peerUrl || !secret) {
    return null;
  }

  const roleRaw = env.CORE_REPLICATION_ROLE?.trim().toLowerCase();
  const role: CoreReplicationRole =
    roleRaw === "cloud" ? "cloud" : "local";

  return {
    peerUrl: peerUrl.replace(/\/$/, ""),
    secret,
    role,
  };
}

export function isCoreReplicationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getCoreReplicationConfig(env) !== null;
}
