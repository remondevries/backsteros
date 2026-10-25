"use client";

import {
  adoptRemoteRunningTimerClock,
  isActiveOpenRunningTimer,
  resolveTrackedDurationSeconds,
  trackedDurationSecondsFromElapsed,
} from "@backsteros/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  buildTrackedTimerKey,
  type RemoteRunningTimerAdoption,
  type SyncRemoteRunningTimersOptions,
  type TrackedTimerListItem,
  type TrackedTimerRegistration,
  type TrackedTimerSessionMeta,
} from "./tracked-timer-types.js";

type TimerEntry = TrackedTimerSessionMeta & {
  key: string;
  trackedDurationSeconds: number | null;
  trackedMinutes: number | null;
  scheduleMinutes: number | null;
  /** Highest duration committed from this timer session; never regresses on stale props. */
  accumulatedSeconds: number;
  baseSeconds: number;
  sessionStartAt: number | null;
  lastActiveAt: number;
  startedAt: number | null;
  /** True when this running session was mirrored from another client. */
  adoptedFromRemote: boolean;
  /** Remote `timer_started` wall time; used for accurate stop activity duration. */
  remoteStartedAtMs: number | null;
  onPersist: ((seconds: number | null, fromTimerPause?: boolean) => void) | null;
  onSessionChange: ((
    action: "started" | "stopped",
    sessionSeconds?: number,
  ) => void) | null;
};

function memorySeconds(entry: TimerEntry | undefined): number {
  if (!entry) return 0;
  return Math.max(
    entry.accumulatedSeconds,
    entry.baseSeconds,
    entry.trackedDurationSeconds ?? 0,
  );
}

function resolvedSecondsFromFields(input: {
  trackedDurationSeconds: number | null;
  trackedMinutes: number | null;
  scheduleMinutes: number | null;
}): number {
  return (
    resolveTrackedDurationSeconds({
      trackedDurationSeconds: input.trackedDurationSeconds,
      trackedMinutes: input.trackedMinutes,
      scheduleMinutes: input.scheduleMinutes,
    }) ?? 0
  );
}

function registrationSecondsFromProps(
  registration: TrackedTimerRegistration,
): number {
  if (
    registration.trackedDurationSeconds != null &&
    registration.trackedDurationSeconds > 0
  ) {
    return registration.trackedDurationSeconds;
  }
  if (
    registration.trackedMinutes != null &&
    registration.trackedMinutes > 0
  ) {
    return registration.trackedMinutes * 60;
  }
  return 0;
}

/** Accumulated duration for a paused timer; prefers in-memory totals over stale props. */
function storedSecondsForEntry(entry: TimerEntry): number {
  if (entry.sessionStartAt != null) {
    return Math.max(entry.baseSeconds, entry.accumulatedSeconds);
  }
  return Math.max(
    memorySeconds(entry),
    resolvedSecondsFromFields(entry),
  );
}

function elapsedSecondsForEntry(entry: TimerEntry): number {
  if (entry.sessionStartAt != null) {
    return (
      entry.baseSeconds +
      Math.floor((Date.now() - entry.sessionStartAt) / 1000)
    );
  }
  return storedSecondsForEntry(entry);
}

function secondsFromEntry(entry: TimerEntry): number | null {
  return trackedDurationSecondsFromElapsed(elapsedSecondsForEntry(entry));
}

function listRunningEntryKeys(entries: Map<string, TimerEntry>): string[] {
  const keys: string[] = [];
  for (const entry of entries.values()) {
    if (entry.sessionStartAt != null) keys.push(entry.key);
  }
  return keys;
}

function findPrimaryRunningKey(
  entries: Map<string, TimerEntry>,
  preferredKey: string | null,
): string | null {
  if (preferredKey) {
    const preferred = entries.get(preferredKey);
    if (preferred?.sessionStartAt != null) return preferredKey;
  }
  let bestKey: string | null = null;
  let bestStarted = -1;
  for (const entry of entries.values()) {
    if (entry.sessionStartAt == null) continue;
    if (entry.sessionStartAt >= bestStarted) {
      bestStarted = entry.sessionStartAt;
      bestKey = entry.key;
    }
  }
  return bestKey;
}

function isEntryRunning(entry: TimerEntry | undefined): boolean {
  return entry?.sessionStartAt != null;
}

type TrackedTimerContextValue = {
  /** Primary running timer for compact chrome (most recently started, or active). */
  runningKey: string | null;
  resolvedRunningKey: string | null;
  /** All currently running timer keys (parallel sessions allowed). */
  runningKeys: string[];
  activeKey: string | null;
  timerTick: number;
  recentTimers: TrackedTimerListItem[];
  getElapsedSeconds: (key: string) => number;
  registerTimer: (registration: TrackedTimerRegistration) => () => void;
  syncTimerDurationSeconds: (
    key: string,
    trackedDurationSeconds: number | null,
    trackedMinutes?: number | null,
    scheduleMinutes?: number | null,
  ) => void;
  /**
   * Mirror recent / running timers into chrome. Does not post start activities.
   * With `pruneAbsent` (recent-timers), drops remote-seeded rows that left the
   * list. With running-timers fallback, folds missing live clocks to paused and
   * keeps them visible. Never kills a locally owned running session.
   */
  syncRemoteRunningTimers: (
    adoptions: RemoteRunningTimerAdoption[],
    options?: SyncRemoteRunningTimersOptions,
  ) => void;
  isTimerRunning: (key: string) => boolean;
  startTimer: (key: string) => void;
  pauseTimer: (key: string) => void;
  toggleTimer: (key: string) => void;
  selectTimer: (key: string, options?: { navigate?: boolean }) => void;
  onNavigate?: (href: string) => void;
};

const TrackedTimerContext = createContext<TrackedTimerContextValue | null>(null);

const TIMER_CHECKPOINT_INTERVAL_MS = 60_000;

export function useTrackedTimerOptional(): TrackedTimerContextValue | null {
  return useContext(TrackedTimerContext);
}

export function useTrackedTimer(): TrackedTimerContextValue {
  const value = useContext(TrackedTimerContext);
  if (!value) {
    throw new Error("useTrackedTimer requires TrackedTimerProvider");
  }
  return value;
}

export function TrackedTimerProvider({
  children,
  onNavigate,
}: {
  children: ReactNode;
  onNavigate?: (href: string) => void;
}) {
  const entriesRef = useRef(new Map<string, TimerEntry>());
  /** Preferred primary running key for compact header chrome. */
  const primaryRunningKeyRef = useRef<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [runningKeys, setRunningKeys] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [entriesRevision, setEntriesRevision] = useState(0);

  const bumpEntries = useCallback(() => {
    setEntriesRevision((value) => value + 1);
  }, []);

  const syncRunningState = useCallback((preferredKey: string | null = null) => {
    const keys = listRunningEntryKeys(entriesRef.current);
    const primary = findPrimaryRunningKey(
      entriesRef.current,
      preferredKey ?? primaryRunningKeyRef.current,
    );
    primaryRunningKeyRef.current = primary;
    setRunningKeys(keys);
    setRunningKey(primary);
  }, []);

  const getElapsedSeconds = useCallback((key: string): number => {
    void tick;
    const entry = entriesRef.current.get(key);
    if (!entry) return 0;
    return elapsedSecondsForEntry(entry);
  }, [tick]);

  const commitEntry = useCallback((entry: TimerEntry) => {
    const wasRunning = entry.sessionStartAt != null;
    const sessionAnchorMs = entry.remoteStartedAtMs ?? entry.sessionStartAt;
    const sessionSeconds =
      sessionAnchorMs != null
        ? Math.max(0, Math.floor((Date.now() - sessionAnchorMs) / 1000))
        : 0;
    const seconds = secondsFromEntry(entry);
    const committed = seconds ?? 0;
    entry.accumulatedSeconds = Math.max(entry.accumulatedSeconds, committed);
    entry.trackedDurationSeconds =
      entry.accumulatedSeconds > 0 ? entry.accumulatedSeconds : null;
    entry.baseSeconds = entry.accumulatedSeconds;
    entry.sessionStartAt = null;
    entry.adoptedFromRemote = false;
    entry.remoteStartedAtMs = null;
    entry.onPersist?.(seconds, wasRunning);
    if (wasRunning) {
      entry.onSessionChange?.("stopped", sessionSeconds);
    }
    entriesRef.current.set(entry.key, entry);
  }, []);

  const checkpointEntry = useCallback(
    (entry: TimerEntry, persist = true) => {
      if (entry.sessionStartAt == null) return false;
      const seconds = secondsFromEntry(entry);
      if (seconds == null) return false;

      entry.accumulatedSeconds = Math.max(entry.accumulatedSeconds, seconds);
      entry.trackedDurationSeconds = seconds;
      entry.baseSeconds = entry.accumulatedSeconds;
      entry.sessionStartAt = Date.now();
      entriesRef.current.set(entry.key, entry);
      if (persist) {
        entry.onPersist?.(seconds, false);
      }
      return true;
    },
    [],
  );

  const checkpointRunningTimers = useCallback(
    (persist = true) => {
      let changed = false;
      for (const key of listRunningEntryKeys(entriesRef.current)) {
        const entry = entriesRef.current.get(key);
        if (!entry) continue;
        if (checkpointEntry(entry, persist)) changed = true;
      }
      if (changed) {
        setTick((value) => value + 1);
      }
      return changed;
    },
    [checkpointEntry],
  );

  const anyRunning = runningKeys.length > 0;

  useEffect(() => {
    if (!anyRunning && !findPrimaryRunningKey(entriesRef.current, null)) return;
    const id = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [anyRunning, entriesRevision, runningKey]);

  useEffect(() => {
    if (!anyRunning && !findPrimaryRunningKey(entriesRef.current, null)) return;
    const id = window.setInterval(() => {
      checkpointRunningTimers(true);
    }, TIMER_CHECKPOINT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [anyRunning, checkpointRunningTimers, entriesRevision, runningKey]);

  const pauseTimer = useCallback(
    (key: string) => {
      const entry = entriesRef.current.get(key);
      if (!entry || entry.sessionStartAt == null) return;
      commitEntry(entry);
      syncRunningState(primaryRunningKeyRef.current === key ? null : primaryRunningKeyRef.current);
      bumpEntries();
      setTick((value) => value + 1);
    },
    [bumpEntries, commitEntry, syncRunningState],
  );

  const startTimer = useCallback(
    (key: string) => {
      let entry = entriesRef.current.get(key);
      if (!entry) return;
      if (entry.sessionStartAt != null) {
        setActiveKey(key);
        syncRunningState(key);
        return;
      }

      const seconds = storedSecondsForEntry(entry);
      entry = {
        ...entry,
        baseSeconds: seconds,
        accumulatedSeconds: Math.max(entry.accumulatedSeconds, seconds),
        sessionStartAt: Date.now(),
        startedAt: entry.startedAt ?? Date.now(),
        trackedDurationSeconds: seconds > 0 ? seconds : null,
        adoptedFromRemote: false,
        remoteStartedAtMs: null,
      };
      entriesRef.current.set(key, entry);
      entry.onSessionChange?.("started");
      setActiveKey(key);
      syncRunningState(key);
      bumpEntries();
      setTick((value) => value + 1);
    },
    [bumpEntries, syncRunningState],
  );

  const toggleTimer = useCallback(
    (key: string) => {
      const entry = entriesRef.current.get(key);
      if (isEntryRunning(entry)) {
        pauseTimer(key);
        return;
      }
      startTimer(key);
    },
    [pauseTimer, startTimer],
  );

  const registerTimer = useCallback(
    (registration: TrackedTimerRegistration) => {
      const key = buildTrackedTimerKey(
        registration.kind,
        registration.entityId,
      );
      const existing = entriesRef.current.get(key);
      const isRunningEntry = existing?.sessionStartAt != null;
      const propSeconds = registrationSecondsFromProps({
        ...registration,
        trackedDurationSeconds:
          registration.trackedDurationSeconds ??
          existing?.trackedDurationSeconds ??
          null,
      });
      const rememberedSeconds = memorySeconds(existing);
      const hasTimerHistory =
        rememberedSeconds > 0 ||
        existing?.startedAt != null ||
        isRunningEntry ||
        existing?.sessionStartAt != null;
      const seededSeconds = hasTimerHistory
        ? Math.max(propSeconds, rememberedSeconds)
        : Math.max(
            propSeconds,
            resolvedSecondsFromFields({
              trackedDurationSeconds: registration.trackedDurationSeconds,
              trackedMinutes: registration.trackedMinutes ?? null,
              scheduleMinutes: registration.scheduleMinutes ?? null,
            }),
          );
      const nextAccumulatedSeconds = Math.max(
        existing?.accumulatedSeconds ?? 0,
        seededSeconds,
      );
      const nextTrackedDurationSeconds =
        existing?.sessionStartAt != null
          ? existing.trackedDurationSeconds
          : nextAccumulatedSeconds > 0
            ? nextAccumulatedSeconds
            : null;
      const pausedBaseSeconds =
        existing?.sessionStartAt != null
          ? Math.max(existing.baseSeconds, existing.accumulatedSeconds)
          : nextAccumulatedSeconds;
      const next: TimerEntry = {
        key,
        kind: registration.kind,
        entityId: registration.entityId,
        title: registration.title,
        subtitle: registration.subtitle ?? null,
        statusKey: registration.statusKey ?? null,
        href: registration.href,
        trackedDurationSeconds: nextTrackedDurationSeconds,
        trackedMinutes: registration.trackedMinutes ?? existing?.trackedMinutes ?? null,
        scheduleMinutes: registration.scheduleMinutes ?? existing?.scheduleMinutes ?? null,
        accumulatedSeconds: nextAccumulatedSeconds,
        baseSeconds: pausedBaseSeconds,
        sessionStartAt: existing?.sessionStartAt ?? null,
        lastActiveAt: existing?.lastActiveAt ?? Date.now(),
        startedAt:
          existing?.startedAt ??
          (isRunningEntry ||
          existing?.sessionStartAt != null ||
          nextAccumulatedSeconds > 0
            ? Date.now()
            : null),
        // Local UI registration owns this entry — do not let recent-timers
        // prune wipe the chrome while the field (or a later visit) needs it.
        adoptedFromRemote: false,
        remoteStartedAtMs: existing?.remoteStartedAtMs ?? null,
        onPersist: registration.onPersist,
        onSessionChange: registration.onSessionChange ?? null,
      };
      entriesRef.current.set(key, next);
      syncRunningState(primaryRunningKeyRef.current);
      bumpEntries();

      return () => {
        const current = entriesRef.current.get(key);
        if (!current) return;
        if (current.sessionStartAt != null) {
          // Keep persist callbacks while this timer is still running.
          return;
        }
        entriesRef.current.set(key, {
          ...current,
          onPersist: null,
          onSessionChange: null,
        });
        bumpEntries();
      };
    },
    [bumpEntries, syncRunningState],
  );

  const syncRemoteRunningTimers = useCallback(
    (
      adoptions: RemoteRunningTimerAdoption[],
      options?: SyncRemoteRunningTimersOptions,
    ) => {
      const pruneAbsent = options?.pruneAbsent === true;
      const remoteKeys = new Set<string>();
      let changed = false;

      for (const adoption of adoptions) {
        const key = buildTrackedTimerKey(adoption.kind, adoption.entityId);
        const lastTimerAtMs =
          adoption.lastTimerAtMs != null &&
          Number.isFinite(adoption.lastTimerAtMs)
            ? adoption.lastTimerAtMs
            : adoption.remoteStartedAtMs;
        // recent-timers already classifies with isActiveOpenRunningTimer;
        // legacy running-timers payloads omit isRunning and need the check.
        const live =
          adoption.isRunning !== undefined
            ? adoption.isRunning
            : isActiveOpenRunningTimer({
                startedAtMs: adoption.remoteStartedAtMs,
                trackedDurationSeconds: adoption.trackedDurationSeconds,
                trackedMinutes: adoption.trackedMinutes,
                updatedAtMs: adoption.updatedAtMs,
              });

        remoteKeys.add(key);
        const existing = entriesRef.current.get(key);
        const isLocallyOwnedRunning =
          existing?.sessionStartAt != null && !existing.adoptedFromRemote;

        if (isLocallyOwnedRunning) {
          // This process started the timer — keep local clock; refresh meta only.
          if (
            existing.title !== adoption.title ||
            existing.subtitle !== (adoption.subtitle ?? null) ||
            existing.statusKey !== (adoption.statusKey ?? null) ||
            existing.href !== adoption.href
          ) {
            entriesRef.current.set(key, {
              ...existing,
              title: adoption.title,
              subtitle: adoption.subtitle ?? null,
              statusKey: adoption.statusKey ?? null,
              href: adoption.href,
            });
            changed = true;
          }
          continue;
        }

        const propSeconds = registrationSecondsFromProps(adoption);
        const rememberedSeconds = memorySeconds(existing);
        const seededSeconds = Math.max(propSeconds, rememberedSeconds);

        if (live) {
          const clock = adoptRemoteRunningTimerClock({
            remoteStartedAtMs: adoption.remoteStartedAtMs,
            trackedDurationSeconds: adoption.trackedDurationSeconds,
            trackedMinutes: adoption.trackedMinutes,
            updatedAtMs: adoption.updatedAtMs,
          });

          if (existing?.sessionStartAt != null && existing.adoptedFromRemote) {
            // Re-anchor to cloud start so late adopters stay aligned.
            entriesRef.current.set(key, {
              ...existing,
              title: adoption.title,
              subtitle: adoption.subtitle ?? null,
              statusKey: adoption.statusKey ?? null,
              href: adoption.href,
              baseSeconds: clock.baseSeconds,
              accumulatedSeconds: Math.max(
                existing.accumulatedSeconds,
                clock.baseSeconds,
              ),
              sessionStartAt: clock.sessionStartAt,
              remoteStartedAtMs: adoption.remoteStartedAtMs,
              trackedDurationSeconds:
                seededSeconds > 0 ? seededSeconds : existing.trackedDurationSeconds,
              trackedMinutes:
                adoption.trackedMinutes ?? existing.trackedMinutes,
              onPersist: adoption.onPersist,
              onSessionChange: adoption.onSessionChange ?? null,
            });
            changed = true;
            continue;
          }

          const next: TimerEntry = {
            key,
            kind: adoption.kind,
            entityId: adoption.entityId,
            title: adoption.title,
            subtitle: adoption.subtitle ?? null,
            statusKey: adoption.statusKey ?? null,
            href: adoption.href,
            trackedDurationSeconds: seededSeconds > 0 ? seededSeconds : null,
            trackedMinutes: adoption.trackedMinutes ?? null,
            scheduleMinutes: adoption.scheduleMinutes ?? null,
            accumulatedSeconds: clock.baseSeconds,
            baseSeconds: clock.baseSeconds,
            // Shared cloud wall clock — not adopt-local Date.now().
            sessionStartAt: clock.sessionStartAt,
            lastActiveAt: Date.now(),
            startedAt: existing?.startedAt ?? adoption.remoteStartedAtMs,
            adoptedFromRemote: true,
            remoteStartedAtMs: adoption.remoteStartedAtMs,
            onPersist: adoption.onPersist,
            onSessionChange: adoption.onSessionChange ?? null,
          };
          entriesRef.current.set(key, next);
          changed = true;
          continue;
        }

        // Paused (or abandoned start) — seed dropdown membership without a clock.
        if (existing?.sessionStartAt != null && existing.adoptedFromRemote) {
          const elapsed = elapsedSecondsForEntry(existing);
          const folded = Math.max(
            existing.accumulatedSeconds,
            elapsed,
            seededSeconds,
          );
          entriesRef.current.set(key, {
            ...existing,
            title: adoption.title,
            subtitle: adoption.subtitle ?? null,
            statusKey: adoption.statusKey ?? null,
            href: adoption.href,
            accumulatedSeconds: folded,
            baseSeconds: folded,
            trackedDurationSeconds: folded > 0 ? folded : null,
            trackedMinutes: adoption.trackedMinutes ?? existing.trackedMinutes,
            sessionStartAt: null,
            startedAt: lastTimerAtMs,
            lastActiveAt: lastTimerAtMs,
            adoptedFromRemote: true,
            remoteStartedAtMs: null,
            onPersist: adoption.onPersist,
            onSessionChange: adoption.onSessionChange ?? null,
          });
          changed = true;
          continue;
        }

        if (
          existing &&
          existing.sessionStartAt == null &&
          existing.adoptedFromRemote
        ) {
          entriesRef.current.set(key, {
            ...existing,
            title: adoption.title,
            subtitle: adoption.subtitle ?? null,
            statusKey: adoption.statusKey ?? null,
            href: adoption.href,
            accumulatedSeconds: Math.max(
              existing.accumulatedSeconds,
              seededSeconds,
            ),
            baseSeconds: Math.max(existing.baseSeconds, seededSeconds),
            trackedDurationSeconds:
              Math.max(existing.accumulatedSeconds, seededSeconds) > 0
                ? Math.max(existing.accumulatedSeconds, seededSeconds)
                : null,
            trackedMinutes: adoption.trackedMinutes ?? existing.trackedMinutes,
            startedAt: existing.startedAt ?? lastTimerAtMs,
            lastActiveAt: lastTimerAtMs,
            onPersist: adoption.onPersist,
            onSessionChange: adoption.onSessionChange ?? null,
          });
          changed = true;
          continue;
        }

        if (existing && !existing.adoptedFromRemote) {
          // Local paused registration — refresh meta/duration only.
          entriesRef.current.set(key, {
            ...existing,
            title: adoption.title,
            subtitle: adoption.subtitle ?? null,
            statusKey: adoption.statusKey ?? null,
            href: adoption.href,
            accumulatedSeconds: Math.max(
              existing.accumulatedSeconds,
              seededSeconds,
            ),
            baseSeconds: Math.max(existing.baseSeconds, seededSeconds),
            trackedDurationSeconds:
              Math.max(existing.accumulatedSeconds, seededSeconds) > 0
                ? Math.max(existing.accumulatedSeconds, seededSeconds)
                : null,
            startedAt: existing.startedAt ?? lastTimerAtMs,
            onPersist: adoption.onPersist,
            onSessionChange: adoption.onSessionChange ?? existing.onSessionChange,
          });
          changed = true;
          continue;
        }

        const nextPaused: TimerEntry = {
          key,
          kind: adoption.kind,
          entityId: adoption.entityId,
          title: adoption.title,
          subtitle: adoption.subtitle ?? null,
          statusKey: adoption.statusKey ?? null,
          href: adoption.href,
          trackedDurationSeconds: seededSeconds > 0 ? seededSeconds : null,
          trackedMinutes: adoption.trackedMinutes ?? null,
          scheduleMinutes: adoption.scheduleMinutes ?? null,
          accumulatedSeconds: seededSeconds,
          baseSeconds: seededSeconds,
          sessionStartAt: null,
          lastActiveAt: lastTimerAtMs,
          startedAt: lastTimerAtMs,
          adoptedFromRemote: true,
          remoteStartedAtMs: null,
          onPersist: adoption.onPersist,
          onSessionChange: adoption.onSessionChange ?? null,
        };
        entriesRef.current.set(key, nextPaused);
        changed = true;
      }

      for (const entry of [...entriesRef.current.values()]) {
        if (!entry.adoptedFromRemote) continue;
        if (remoteKeys.has(entry.key)) continue;
        if (entry.sessionStartAt != null) {
          // Left the live list — fold to paused without re-posting stop.
          const elapsed = elapsedSecondsForEntry(entry);
          entry.accumulatedSeconds = Math.max(
            entry.accumulatedSeconds,
            elapsed,
          );
          entry.trackedDurationSeconds =
            entry.accumulatedSeconds > 0 ? entry.accumulatedSeconds : null;
          entry.baseSeconds = entry.accumulatedSeconds;
          entry.sessionStartAt = null;
          entry.remoteStartedAtMs = null;
          entry.lastActiveAt = Date.now();
          // Stick in chrome until recent-timers membership prunes it.
          entry.adoptedFromRemote = false;
          entriesRef.current.set(entry.key, entry);
          changed = true;
          if (!pruneAbsent) continue;
        }
        if (!pruneAbsent) continue;
        entriesRef.current.delete(entry.key);
        changed = true;
      }

      // If the selected chrome row was pruned, pick another so the strip stays.
      setActiveKey((current) => {
        if (current != null && entriesRef.current.has(current)) return current;
        const fallback =
          findPrimaryRunningKey(entriesRef.current, primaryRunningKeyRef.current) ??
          [...entriesRef.current.keys()][0] ??
          null;
        return fallback;
      });

      if (!changed) return;
      syncRunningState(primaryRunningKeyRef.current);
      bumpEntries();
      setTick((value) => value + 1);
    },
    [bumpEntries, syncRunningState],
  );

  const syncTimerDurationSeconds = useCallback(
    (
      key: string,
      trackedDurationSeconds: number | null,
      trackedMinutes?: number | null,
      scheduleMinutes?: number | null,
    ) => {
      const entry = entriesRef.current.get(key);
      if (!entry || entry.sessionStartAt != null) return;
      const resolvedSeconds = resolvedSecondsFromFields({
        trackedDurationSeconds,
        trackedMinutes: trackedMinutes ?? entry.trackedMinutes,
        scheduleMinutes: scheduleMinutes ?? entry.scheduleMinutes,
      });
      const nextAccumulatedSeconds = Math.max(
        entry.accumulatedSeconds,
        resolvedSeconds,
        trackedDurationSeconds ?? 0,
      );
      if (
        trackedDurationSeconds == null &&
        resolvedSeconds <= 0 &&
        nextAccumulatedSeconds > 0
      ) {
        return;
      }
      const next: TimerEntry = {
        ...entry,
        accumulatedSeconds: nextAccumulatedSeconds,
        trackedDurationSeconds:
          nextAccumulatedSeconds > 0 ? nextAccumulatedSeconds : null,
        trackedMinutes: trackedMinutes ?? entry.trackedMinutes,
        scheduleMinutes: scheduleMinutes ?? entry.scheduleMinutes,
        baseSeconds: nextAccumulatedSeconds,
      };
      entriesRef.current.set(key, next);
    },
    [],
  );

  const selectTimer = useCallback(
    (key: string, options?: { navigate?: boolean }) => {
      const entry = entriesRef.current.get(key);
      if (!entry) return;

      setActiveKey(key);
      if (isEntryRunning(entry)) {
        syncRunningState(key);
      }
      setTick((value) => value + 1);

      if (options?.navigate !== false) {
        onNavigate?.(entry.href);
      }
    },
    [onNavigate, syncRunningState],
  );

  const resolvedRunningKey = useMemo(() => {
    if (runningKey) return runningKey;
    return findPrimaryRunningKey(entriesRef.current, activeKey);
    // `entriesRevision` / `tick` re-read the mutable entries ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, entriesRevision, runningKey, tick]);

  const recentTimers = useMemo(() => {
    const items = [...entriesRef.current.values()]
      .filter(
        (entry) =>
          entry.sessionStartAt != null ||
          entry.startedAt != null ||
          memorySeconds(entry) > 0,
      )
      // Stable order: first-seen / first-started time only.
      // Pause / play must not reshuffle the dropdown.
      .sort((a, b) => {
        const aStart = a.startedAt ?? a.lastActiveAt;
        const bStart = b.startedAt ?? b.lastActiveAt;
        if (aStart !== bStart) return aStart - bStart;
        return a.key.localeCompare(b.key);
      })
      .map(
        (entry): TrackedTimerListItem => ({
          key: entry.key,
          kind: entry.kind,
          entityId: entry.entityId,
          title: entry.title,
          subtitle: entry.subtitle,
          statusKey: entry.statusKey,
          href: entry.href,
          elapsedSeconds: elapsedSecondsForEntry(entry),
          isRunning: isEntryRunning(entry),
          isActive: (activeKey ?? resolvedRunningKey) === entry.key,
          lastActiveAt: entry.lastActiveAt,
        }),
      );
    void tick;
    return items;
    // `entriesRevision` re-reads the mutable entries ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, entriesRevision, resolvedRunningKey, tick]);

  const value = useMemo(
    (): TrackedTimerContextValue => ({
      runningKey,
      resolvedRunningKey,
      runningKeys,
      activeKey,
      timerTick: tick,
      recentTimers,
      getElapsedSeconds,
      registerTimer,
      syncTimerDurationSeconds,
      syncRemoteRunningTimers,
      isTimerRunning: (key) => isEntryRunning(entriesRef.current.get(key)),
      startTimer,
      pauseTimer,
      toggleTimer,
      selectTimer,
      onNavigate,
    }),
    [
      activeKey,
      getElapsedSeconds,
      onNavigate,
      pauseTimer,
      recentTimers,
      registerTimer,
      resolvedRunningKey,
      runningKey,
      runningKeys,
      selectTimer,
      startTimer,
      syncRemoteRunningTimers,
      syncTimerDurationSeconds,
      tick,
      toggleTimer,
    ],
  );

  return (
    <TrackedTimerContext.Provider value={value}>
      {children}
    </TrackedTimerContext.Provider>
  );
}

export {
  buildTrackedTimerKey,
  type TrackedTimerSessionMeta,
  type TrackedTimerRegistration,
  type RemoteRunningTimerAdoption,
  type TrackedTimerListItem,
} from "./tracked-timer-types.js";
