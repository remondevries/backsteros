import { create } from "zustand";

import type { CursorUsage } from "~/backsteros/cursorUsage";

const POLL_MS = 5 * 60 * 1000;
/** Keep the shared poller alive across brief remounts (Code ↔ Servers). */
const UNSUBSCRIBE_GRACE_MS = 2_000;
const CURSOR_USAGE_PATH = "/api/cursor-plan-usage";

type CursorUsageStore = {
  readonly usage: CursorUsage | null;
  readonly loading: boolean;
  readonly subscriberCount: number;
  readonly subscribe: () => () => void;
  readonly refresh: () => Promise<void>;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;

async function fetchCursorUsage(): Promise<CursorUsage> {
  try {
    const response = await fetch(CURSOR_USAGE_PATH, { cache: "no-store" });
    const data = (await response.json()) as { usage?: CursorUsage | null };
    return (
      data.usage ?? {
        available: false,
        autoPercentUsed: 0,
        apiPercentUsed: 0,
        totalPercentUsed: 0,
        error: "Cursor credits unavailable",
        sampledAt: Date.now(),
      }
    );
  } catch {
    return {
      available: false,
      autoPercentUsed: 0,
      apiPercentUsed: 0,
      totalPercentUsed: 0,
      error: "Cursor credits unavailable",
      sampledAt: Date.now(),
    };
  }
}

function stopPolling() {
  if (pollTimer == null) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

/**
 * Shared Cursor plan usage so sidebar remounts (Code ↔ Servers) reuse the last
 * snapshot instead of flashing "Loading plan…" and refetching immediately.
 */
export const useCursorUsageStore = create<CursorUsageStore>((set, get) => ({
  usage: null,
  loading: true,
  subscriberCount: 0,
  refresh: async () => {
    if (inFlight) {
      await inFlight;
      return;
    }
    inFlight = (async () => {
      const usage = await fetchCursorUsage();
      set({ usage, loading: false });
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  },
  subscribe: () => {
    if (stopTimer != null) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    const nextCount = get().subscriberCount + 1;
    set({ subscriberCount: nextCount });
    if (nextCount === 1) {
      // Only fetch when we have nothing yet; remounts reuse the snapshot.
      if (get().usage == null) {
        void get().refresh();
      } else {
        set({ loading: false });
      }
      if (pollTimer == null) {
        pollTimer = setInterval(() => {
          void get().refresh();
        }, POLL_MS);
      }
    }
    return () => {
      const remaining = Math.max(0, get().subscriberCount - 1);
      set({ subscriberCount: remaining });
      if (remaining === 0) {
        stopTimer = setTimeout(() => {
          stopTimer = null;
          if (get().subscriberCount === 0) stopPolling();
        }, UNSUBSCRIBE_GRACE_MS);
      }
    };
  },
}));
