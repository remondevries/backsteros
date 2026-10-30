/**
 * Shared SSE reconnect status for desktop cloud-client banners.
 *
 * Presence and email inbox streams both hit local-core over SSE. Brief drops
 * (idle recycle, proxy close, core blip) already auto-reconnect; reporting
 * "disconnected" immediately — then "connecting" on each retry — made the
 * banner flash. Debounce the outage notice and stay quiet across soft recycles.
 */

export type SseConnectionStatus = "connecting" | "live" | "disconnected";

/** Banner only after this long without a successful live session. */
export const SSE_DISCONNECTED_BANNER_DEBOUNCE_MS = 4_000;

export function createSseConnectionReporter(
  onConnection: ((status: SseConnectionStatus) => void) | undefined,
  options?: { debounceMs?: number },
): {
  beginAttempt: () => void;
  live: () => void;
  failed: () => void;
  dispose: () => void;
} {
  const debounceMs = options?.debounceMs ?? SSE_DISCONNECTED_BANNER_DEBOUNCE_MS;
  let everLive = false;
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastReported: SseConnectionStatus | null = null;

  const report = (status: SseConnectionStatus) => {
    if (lastReported === status) return;
    lastReported = status;
    onConnection?.(status);
  };

  const clearDisconnectTimer = () => {
    if (!disconnectTimer) return;
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  };

  return {
    /** Start of a subscribe attempt — soft recycle after live stays live. */
    beginAttempt() {
      if (everLive) return;
      if (lastReported === "disconnected") return;
      report("connecting");
    },
    live() {
      clearDisconnectTimer();
      everLive = true;
      report("live");
    },
    /** Stream error; announce disconnected only after sustained outage. */
    failed() {
      if (lastReported === "disconnected" || disconnectTimer) return;
      disconnectTimer = setTimeout(() => {
        disconnectTimer = null;
        report("disconnected");
      }, debounceMs);
    },
    dispose() {
      clearDisconnectTimer();
    },
  };
}
