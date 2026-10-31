/**
 * Soft-cap detection for always-on PowerSync list watches (OS-163 #4 / review).
 * SQL uses `LIMIT N`; when the result length equals N the true total may be higher.
 */

export function listWatchHitSoftCap(
  rowCount: number,
  limit: number,
): boolean {
  return Number.isFinite(rowCount) && Number.isFinite(limit) && rowCount >= limit;
}

const loggedCaps = new Set<string>();

/** Log once per process per list key when a soft cap is hit. */
export function logWorkspaceListSoftCapHit(
  listKey: string,
  rowCount: number,
  limit: number,
): boolean {
  if (!listWatchHitSoftCap(rowCount, limit)) return false;
  const key = `${listKey}:${limit}`;
  if (loggedCaps.has(key)) return true;
  loggedCaps.add(key);
  console.warn(
    `[workspace-list] soft cap hit: ${listKey} returned ${rowCount} rows (LIMIT ${limit}); has_more=true — raise limit or window the query`,
  );
  return true;
}

export function resetWorkspaceListSoftCapLogsForTests(): void {
  loggedCaps.clear();
}

export type WorkspaceListSoftCapFlags = {
  tasksHasMore: boolean;
  documentsHasMore: boolean;
  projectsHasMore: boolean;
  contactsHasMore: boolean;
  organizationsHasMore: boolean;
  meetingsHasMore: boolean;
  habitsHasMore: boolean;
  lettersHasMore: boolean;
  areasHasMore: boolean;
};
