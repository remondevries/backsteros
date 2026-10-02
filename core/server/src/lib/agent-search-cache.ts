/**
 * Workspace epoch for agent search/retrieve response caches (OS-76).
 *
 * Bump on every task or document write (API and replication apply share those
 * service paths) so a create/update is visible on the next search instead of
 * waiting for the 15s TTL.
 */

const workspaceEpoch = new Map<string, number>();

export function getAgentSearchCacheEpoch(workspaceId: string): number {
  return workspaceEpoch.get(workspaceId) ?? 0;
}

/** Invalidate cached agent search/retrieve results for this workspace. */
export function bumpAgentSearchCache(workspaceId: string): void {
  workspaceEpoch.set(
    workspaceId,
    (workspaceEpoch.get(workspaceId) ?? 0) + 1,
  );
}

export function clearAgentSearchCacheEpochsForTests(): void {
  workspaceEpoch.clear();
}
