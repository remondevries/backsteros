/**
 * When REST list hydration should refetch (Linear-shaped; dual-hydrate revoked).
 *
 * REST list hydrate only when SQLite is empty or PowerSync is disconnected.
 * One empty-SQLite rescue while connected — never epoch/foreground refetch
 * over local rows while the sync stream is up.
 */
export function shouldMobileRestHydrateOnSyncEpoch(connected: boolean): boolean {
  return !connected;
}

export function shouldMobileRestHydrateOnForeground(connected: boolean): boolean {
  return !connected;
}

/**
 * Cold-start / first hydrate for a list screen.
 * `hasLocalRows` is true once the PowerSync watch has returned any rows.
 */
export function shouldMobileRestHydrateColdStart(
  connected: boolean,
  hasLocalRows: boolean,
): boolean {
  return !connected || !hasLocalRows;
}
