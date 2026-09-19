import { useSyncRemoteRunningTimers } from "../lib/use-sync-remote-running-timers";

/**
 * Mirrors open task timers from PowerSync into TrackedTimerProvider so the
 * top-right chrome shows sessions started in other apps (e.g. development).
 */
export function SyncRemoteRunningTimers() {
  useSyncRemoteRunningTimers();
  return null;
}
