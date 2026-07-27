import { useEffect, useState } from "react";

import { useMobilePowerSync } from "./powersync-context";

/** Wait this long for PowerSync before falling back to REST on an empty DB. */
export const REST_FALLBACK_DELAY_MS = 4500;

/**
 * True when lists should load via REST: PowerSync hard-failed, or sync is
 * still empty after a short wait (cold iPhone with no SQLite cache).
 *
 * Once allowed, stays allowed until local rows arrive or PowerSync is ready —
 * avoids flip-flopping during a reconnect attempt (which would REST-stampede).
 */
export function useRestFallbackGate(localRowCount: number): boolean {
  const powerSync = useMobilePowerSync();
  const [restFallbackAllowed, setRestFallbackAllowed] = useState(false);

  useEffect(() => {
    if (localRowCount > 0 || powerSync.ready) {
      setRestFallbackAllowed(false);
      return;
    }
    if (powerSync.status === "error") {
      setRestFallbackAllowed(true);
      return;
    }
    if (
      powerSync.status !== "connecting" &&
      powerSync.status !== "idle"
    ) {
      return;
    }
    const timer = setTimeout(() => {
      setRestFallbackAllowed(true);
    }, REST_FALLBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [localRowCount, powerSync.ready, powerSync.status]);

  return (
    localRowCount === 0 &&
    (powerSync.status === "error" || restFallbackAllowed)
  );
}
