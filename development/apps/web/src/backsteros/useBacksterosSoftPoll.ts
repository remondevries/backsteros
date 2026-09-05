import { useEffect, useRef } from "react";

/** Default soft-live interval for open BacksterOS panels. */
export const BACKSTEROS_SOFT_POLL_INTERVAL_MS = 3_000;

function documentIsVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/**
 * Visibility-aware interval for soft live refresh.
 * Does not run while the document is hidden; resumes on visible.
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

    const clearTimer = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clearTimer();
      if (cancelled || !documentIsVisible()) return;
      timer = setTimeout(() => {
        void runTick();
      }, intervalMs);
    };

    const runTick = async () => {
      if (cancelled || !documentIsVisible() || inFlight) {
        schedule();
        return;
      }
      inFlight = true;
      try {
        await onTickRef.current();
      } catch {
        // Soft polls are best-effort; keep the last good snapshot.
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
