import type { WhoopSnapshotEntity } from "@/lib/whoop/types";

const WHOOP_SNAPSHOT_TTL_MS = 120_000;

type WhoopCacheEntry = {
  fetchedAt: number;
  snapshot: WhoopSnapshotEntity;
};

const whoopSnapshotCache = new Map<string, WhoopCacheEntry>();

export function peekWhoopSnapshotCache(date: string): WhoopSnapshotEntity | null {
  const entry = whoopSnapshotCache.get(date);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.fetchedAt >= WHOOP_SNAPSHOT_TTL_MS) {
    whoopSnapshotCache.delete(date);
    return null;
  }
  return entry.snapshot;
}

export function setWhoopSnapshotCache(date: string, snapshot: WhoopSnapshotEntity): void {
  whoopSnapshotCache.set(date, { fetchedAt: Date.now(), snapshot });
}
