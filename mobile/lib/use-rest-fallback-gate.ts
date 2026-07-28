import { useMobilePowerSync } from "./powersync-context";

/** Wait this long for PowerSync before falling back to REST on an empty DB. */
export const REST_FALLBACK_DELAY_MS = 4500;

/**
 * True when lists should load via REST: PowerSync hard-failed, or sync is
 * still empty after a short wait (cold iPhone with no SQLite cache).
 *
 * The delay itself lives in `PowerSyncProvider` so navigating between screens
 * does not restart a fresh 4.5s spinner wait on every mount.
 */
export function useRestFallbackGate(localRowCount: number): boolean {
  const powerSync = useMobilePowerSync();

  return (
    localRowCount === 0 &&
    !powerSync.ready &&
    (powerSync.status === "error" || powerSync.restFallbackAllowed)
  );
}
