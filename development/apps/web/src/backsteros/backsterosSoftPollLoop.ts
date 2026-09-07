import { BACKSTEROS_SOFT_POLL_MAX_INTERVAL_MS, softPollDelayMs } from "./useBacksterosSoftPoll";

function documentIsVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/**
 * Non-React soft-poll loop (shared query stores). Mirrors `useBacksterosSoftPoll`.
 */
export function startBacksterosSoftPollLoop(input: {
  readonly onTick: () => void | Promise<void>;
  readonly intervalMs: number;
  readonly isEnabled?: () => boolean;
}): () => void {
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
    if (input.isEnabled && !input.isEnabled()) return;
    const delayMs = softPollDelayMs(
      input.intervalMs,
      consecutiveFailures,
      BACKSTEROS_SOFT_POLL_MAX_INTERVAL_MS,
    );
    timer = setTimeout(() => {
      void runTick();
    }, delayMs);
  };

  const runTick = async () => {
    if (cancelled || !documentIsVisible() || inFlight) {
      schedule();
      return;
    }
    if (input.isEnabled && !input.isEnabled()) {
      schedule();
      return;
    }
    inFlight = true;
    try {
      await input.onTick();
      consecutiveFailures = 0;
    } catch {
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

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  schedule();

  return () => {
    cancelled = true;
    clearTimer();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}
