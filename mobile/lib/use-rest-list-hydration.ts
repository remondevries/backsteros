import { useEffect } from "react";
import { AppState } from "react-native";

import { useMobilePowerSync } from "./powersync-context";

/** Poll REST while PowerSync is offline so list membership stays fresh. */
const DISCONNECTED_POLL_MS = 12_000;

/**
 * Desktop parity: always hydrate lists from REST (not only on empty SQLite).
 * Refetch on sync epoch, when the app returns to foreground, and on an interval
 * while the PowerSync stream is disconnected.
 */
export function useRestListHydration(
  reload: () => void | Promise<void>,
  enabled = true,
) {
  const powerSync = useMobilePowerSync();
  const connected = powerSync.connected;
  const syncEpoch = powerSync.lastSyncedAt?.getTime() ?? 0;

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload, syncEpoch]);

  useEffect(() => {
    if (!enabled || connected) return;
    const timer = setInterval(() => {
      void reload();
    }, DISCONNECTED_POLL_MS);
    return () => clearInterval(timer);
  }, [connected, enabled, reload]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void reload();
    });
    return () => sub.remove();
  }, [enabled, reload]);
}
