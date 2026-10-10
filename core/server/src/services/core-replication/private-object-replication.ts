/**
 * Pull private `.backsteros/` blobs (task images, etc.) from the peer core
 * when local vault + R2 miss. Metadata twins via REPLICATED_TABLES; bytes
 * usually arrive via shared R2 — this is the fallback (OS-90).
 */
import { getObject } from "../../lib/storage.js";
import { getCoreReplicationConfig } from "./config.js";
import { extractBearerToken, verifyReplicationSecret } from "./auth.js";

const TASK_IMAGE_KEY_PATTERN =
  /^\.backsteros\/attachments\/tasks\//;

export function isTaskImageStorageKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return TASK_IMAGE_KEY_PATTERN.test(key);
}

/** Keys peers may fetch via /internal/core-replication/private-object. */
export function isReplicablePrivateObjectKey(
  key: string | null | undefined,
): boolean {
  return isTaskImageStorageKey(key);
}

export async function fetchPrivateObjectFromPeer(
  storageKey: string,
): Promise<Uint8Array | null> {
  if (!isReplicablePrivateObjectKey(storageKey)) return null;
  const config = getCoreReplicationConfig();
  if (!config) return null;

  const url = new URL(
    `${config.peerUrl}/internal/core-replication/private-object`,
  );
  url.searchParams.set("key", storageKey);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.secret}` },
  });
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

export async function readLocalPrivateObject(
  storageKey: string,
): Promise<Uint8Array | null> {
  if (!isReplicablePrivateObjectKey(storageKey)) return null;
  try {
    const object = await getObject(storageKey, null, {
      skipRemoteRefresh: true,
    });
    return object.bytes;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STORAGE_OBJECT_NOT_FOUND"
    ) {
      return null;
    }
    throw error;
  }
}

export function verifyPrivateObjectReplicationAuth(
  authorization: string | undefined,
): boolean {
  const config = getCoreReplicationConfig();
  if (!config) return false;
  const token = extractBearerToken(authorization);
  return verifyReplicationSecret(token, config.secret);
}
