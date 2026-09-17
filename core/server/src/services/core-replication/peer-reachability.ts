import type { CoreReplicationConfig } from "./config.js";

const DEFAULT_TIMEOUT_MS = 3_000;
const REACHABLE_CACHE_MS = 45_000;
const UNREACHABLE_CACHE_MS = 15_000;

let cached: { at: number; reachable: boolean } | null = null;

/** Lightweight auth ping to the replication peer (local ↔ cloud). */
export async function isReplicationPeerReachable(
  config: CoreReplicationConfig,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  const now = Date.now();
  if (
    cached &&
    now - cached.at <
      (cached.reachable ? REACHABLE_CACHE_MS : UNREACHABLE_CACHE_MS)
  ) {
    return cached.reachable;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let reachable = false;
  try {
    const response = await fetch(
      `${config.peerUrl}/internal/core-replication/ping`,
      {
        headers: { Authorization: `Bearer ${config.secret}` },
        signal: controller.signal,
      },
    );
    reachable = response.ok;
  } catch {
    reachable = false;
  } finally {
    clearTimeout(timeout);
  }

  cached = { at: now, reachable };
  return reachable;
}

export function clearReplicationPeerReachabilityCache(): void {
  cached = null;
}
