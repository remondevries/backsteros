import { useEffect, useRef } from "react";

/** Default soft-live interval for open BacksterOS panels. */
export const BACKSTEROS_SOFT_POLL_INTERVAL_MS = 3_000;

/** Cap so a dead core does not wait forever before probing again. */
export const BACKSTEROS_SOFT_POLL_MAX_INTERVAL_MS = 60_000;

function documentIsVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/** Exponential backoff after consecutive soft-poll failures (3s → 6s → … → 60s). */
export function softPollDelayMs(
  baseIntervalMs: number,
  consecutiveFailures: number,
  maxIntervalMs: number = BACKSTEROS_SOFT_POLL_MAX_INTERVAL_MS,
): number {
  const safeFailures = Math.max(0, consecutiveFailures);
  const delay = baseIntervalMs * 2 ** safeFailures;
  return Math.min(delay, maxIntervalMs);
}

/**
 * Visibility-aware interval for soft live refresh.
 * Does not run while the document is hidden; resumes on visible.
 * Backs off when ticks throw (e.g. BacksterOS 502) so console spam stays quiet.
 */
export function useBacksterosSoftPoll(
  enabled: boolean,
  onTick: () => void | Promise<void>,
  intervalMs: number = BACKSTEROS_SOFT_POLL_INTERVAL_MS,
): void {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let consecutiveFailures = 0;

    const clearTimer = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (cancelled || !documentIsVisible()) return;
      const delayMs = softPollDelayMs(intervalMs, consecutiveFailures);
      timer = setTimeout(() => {
        void runTick();
      }, delayMs);
    };

    const runTick = async () => {
      if (cancelled || !documentIsVisible() || inFlight) {
        schedule();
        return;
      }
      inFlight = true;
      try {
        await onTickRef.current();
        consecutiveFailures = 0;
      } catch {
        // Soft polls are best-effort; keep the last good snapshot and slow down.
        consecutiveFailures += 1;
      } finally {
        inFlight = false;
        schedule();
      }
    };

    const onVisibility = () => {
      if (cancelled) return;
      if (documentIsVisible()) {
        void runTick();
      } else {
        clearTimer();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    schedule();

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}

/** Stable fingerprint so we can skip setState when nothing changed. */
export function stableJsonFingerprint(value: unknown): string {
  return JSON.stringify(value);
}
