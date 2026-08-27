/**
 * TEMPORARY navigation performance probe.
 *
 * Records each keep-alive navigation (from → to, whether it warm-flipped, time
 * to next paint, and main-thread long-task time in the window right after the
 * click) and keeps the last few entries in an in-memory ring buffer.
 *
 * The companion <NavPerfBadge /> overlay renders these on-screen so timings can
 * be read directly from the app window — file/localStorage/devtools channels are
 * unreliable inside the packaged WKWebView.
 *
 * Remove this file, the badge, and their call sites once the slow-transition
 * bug is fixed.
 */

export type NavPerfEntry = {
  t: number;
  from: string | null;
  to: string;
  surface: string;
  flipped: boolean;
  panelToggled: boolean;
  paintMs: number;
  longTaskMs: number;
};

const MAX_ENTRIES = 8;
const entries: NavPerfEntry[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeNavPerf(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getNavPerfEntries(): readonly NavPerfEntry[] {
  return entries;
}

function push(entry: NavPerfEntry): void {
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  emit();
}

/**
 * Call at the moment a navigation is initiated. Measures the time from now
 * until the second animation frame (a proxy for "the new page painted") and
 * sums any long-task durations observed in that window.
 */
export function recordNavPerf(input: {
  from: string | null;
  to: string;
  surface: string;
  flipped: boolean;
  panelToggled: boolean;
}): void {
  if (typeof window === "undefined") return;
  const start = performance.now();
  let longTaskMs = 0;

  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskMs += entry.duration;
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    observer = null;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const paintMs = Math.round(performance.now() - start);
      if (observer) {
        try {
          observer.takeRecords().forEach((entry) => {
            longTaskMs += entry.duration;
          });
        } catch {
          // ignore
        }
        observer.disconnect();
      }
      push({
        t: Date.now(),
        from: input.from,
        to: input.to,
        surface: input.surface,
        flipped: input.flipped,
        panelToggled: input.panelToggled,
        paintMs,
        longTaskMs: Math.round(longTaskMs),
      });
    });
  });
}
