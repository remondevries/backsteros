export type TrackedTimerKind = "task" | "meeting" | "document";

export type TrackedTimerSessionMeta = {
  kind: TrackedTimerKind;
  entityId: string;
  title: string;
  subtitle?: string | null;
  statusKey?: string | null;
  href: string;
};

export type TrackedTimerSessionAction = "started" | "stopped";

export type TrackedTimerRegistration = TrackedTimerSessionMeta & {
  trackedDurationSeconds: number | null;
  trackedMinutes?: number | null;
  scheduleMinutes?: number | null;
  onPersist: (seconds: number | null, fromTimerPause?: boolean) => void;
  /** Fired when a session starts or stops; `sessionSeconds` is only set on stop. */
  onSessionChange?: (
    action: TrackedTimerSessionAction,
    sessionSeconds?: number,
  ) => void;
};

/**
 * Timer row from GET /api/v1/recent-timers (or legacy running-timers).
 * Running rows adopt a live clock; paused rows seed the chrome dropdown.
 */
export type RemoteRunningTimerAdoption = TrackedTimerRegistration & {
  /**
   * Wall-clock ms of the remote unpaired `timer_started` (running) or latest
   * timer activity (paused) — used for stop duration and dropdown order.
   */
  remoteStartedAtMs: number;
  /** Task `updatedAt`. Absent or stale means the start is not a live session. */
  updatedAtMs?: number | null;
  /**
   * Server classification from recent-timers. When omitted, clients fall back
   * to `isActiveOpenRunningTimer` (legacy running-timers payloads).
   */
  isRunning?: boolean;
  /** Latest timer activity ms; defaults to `remoteStartedAtMs` when omitted. */
  lastTimerAtMs?: number | null;
};

/**
 * `pruneAbsent: true` — payload is full recent-timers membership; drop chrome
 * rows that left the list.
 * `pruneAbsent: false` (running-timers fallback) — fold missing live clocks to
 * paused and keep them visible in chrome.
 */
export type SyncRemoteRunningTimersOptions = {
  pruneAbsent?: boolean;
};

export type TrackedTimerListItem = TrackedTimerSessionMeta & {
  key: string;
  elapsedSeconds: number;
  isRunning: boolean;
  isActive: boolean;
  lastActiveAt: number;
};

export function buildTrackedTimerKey(
  kind: TrackedTimerKind,
  entityId: string,
): string {
  return `${kind}:${entityId}`;
}
