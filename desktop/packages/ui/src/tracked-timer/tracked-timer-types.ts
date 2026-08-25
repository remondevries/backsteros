export type TrackedTimerKind = "task" | "meeting";

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
  onSessionChange?: (action: TrackedTimerSessionAction) => void;
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
