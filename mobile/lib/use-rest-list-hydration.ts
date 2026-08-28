import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useMobilePowerSync } from "./powersync-context";
import {
  shouldMobileRestHydrateColdStart,
  shouldMobileRestHydrateOnForeground,
  shouldMobileRestHydrateOnSyncEpoch,
} from "./rest-list-hydration-policy";

/** Poll REST while PowerSync is offline so list membership stays fresh. */
const DISCONNECTED_POLL_MS = 12_000;

/**
 * Cold-start empty-SQLite rescue + offline catch-up (Linear-shaped).
 * When PowerSync is connected and SQLite already has rows — no REST hydrate.
 */
export function useRestListHydration(
  reload: () => void | Promise<void>,
  enabled = true,
  hasLocalRows = false,
) {
  const powerSync = useMobilePowerSync();
  const connected = powerSync.connected;
  const syncEpoch = powerSync.lastSyncedAt?.getTime() ?? 0;
  const hydratedOnceRef = useRef(false);

  // Cold start: one rescue when offline or SQLite is empty.
  useEffect(() => {
    if (!enabled) {
      hydratedOnceRef.current = false;
      return;
    }
    if (hydratedOnceRef.current) return;
    if (!shouldMobileRestHydrateColdStart(connected, hasLocalRows)) {
      // Local rows already authoritative while connected — do not retry later.
      if (hasLocalRows) hydratedOnceRef.current = true;
      return;
    }
    hydratedOnceRef.current = true;
    void reload();
  }, [connected, enabled, hasLocalRows, reload]);

  // Offline only: refetch when a sync checkpoint arrives (SQLite may still be stale).
  useEffect(() => {
    if (!enabled || !shouldMobileRestHydrateOnSyncEpoch(connected)) return;
    if (syncEpoch === 0) return;
    void reload();
  }, [connected, enabled, reload, syncEpoch]);

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
      if (
        next === "active" &&
        shouldMobileRestHydrateOnForeground(connected)
      ) {
        void reload();
      }
    });
    return () => sub.remove();
  }, [connected, enabled, reload]);
}
