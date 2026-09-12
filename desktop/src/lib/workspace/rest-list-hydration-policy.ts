/**
 * Desktop cold-start REST list hydrate policy (Linear-shaped).
 * Mirrors {@link shouldMobileRestHydrateColdStart} in mobile.
 *
 * REST list fan-out only when PowerSync is disconnected or SQLite has no rows
 * yet. Never soft-revalidate full lists over local membership while connected.
 */
export function shouldDesktopRestHydrateColdStart(
  connected: boolean,
  hasLocalRows: boolean,
): boolean {
  return !connected || !hasLocalRows;
}

/**
 * Skip the entire REST wave when PowerSync already completed a sync download.
 * Stronger than {@link shouldDesktopRestHydrateColdStart}: even empty SQLite
 * after a successful sync stays local-primary (no rescue fan-out).
 */
export function shouldDesktopSkipRestHydrateAfterSync(
  ready: boolean,
  lastSyncedAt: Date | string | number | null | undefined,
): boolean {
  return Boolean(ready && lastSyncedAt);
}
