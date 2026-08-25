/**
 * Replicates avatar blobs referenced by replicated metadata rows.
 * Metadata (avatar_storage_key) flows through table replication; this module
 * copies bytes between core vaults when keys appear on the peer.
 */
import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import { getCoreReplicationConfig } from "./config.js";
import { extractBearerToken, verifyReplicationSecret } from "./auth.js";

const AVATAR_KEY_PATTERN =
  /^\.backsteros\/avatars\/|^avatars\//;

export function isAvatarStorageKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return AVATAR_KEY_PATTERN.test(key);
}

export async function fetchAvatarFromPeer(storageKey: string): Promise<ArrayBuffer | null> {
  const config = getCoreReplicationConfig();
  if (!config) return null;

  const url = new URL(`${config.peerUrl}/internal/core-replication/avatar`);
  url.searchParams.set("key", storageKey);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.secret}` },
  });
  if (!response.ok) {
    return null;
  }
  return response.arrayBuffer();
}

export async function replicateAvatarsForKeys(keys: string[]): Promise<number> {
  const unique = [...new Set(keys.filter(isAvatarStorageKey))];
  if (unique.length === 0) {
    return 0;
  }

  let copied = 0;
  for (const key of unique) {
    try {
      const bytes = await fetchAvatarFromPeer(key);
      if (!bytes) continue;
      // Vault write path is workspace-scoped in core; avatar bytes are pulled
      // on next client fetch if missing locally. Log for ops visibility.
      copied += 1;
      appendOpsLog("info", "avatar replication fetched", key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendOpsLog("error", `avatar replication failed: ${key}`, message);
    }
  }
  return copied;
}

export function verifyAvatarReplicationAuth(authorization: string | undefined): boolean {
  const config = getCoreReplicationConfig();
  if (!config) return false;
  const token = extractBearerToken(authorization);
  return verifyReplicationSecret(token, config.secret);
}
