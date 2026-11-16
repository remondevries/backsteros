"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Robustly renders long transaction lists by only mounting a bounded window of
 * rows and revealing more as the user scrolls a sentinel into view. This keeps
 * the DOM small (avoids the freeze/crash from mounting thousands of rows with
 * inline dropdowns at once) while keeping scroll fluid.
 *
 * Usage:
 * - `visibleCount` — slice the ordered list to this many items before rendering.
 * - `sentinelRef` — attach to an element at the end of the rendered list.
 * - `resetKey` — change to reset the window back to `initial` (e.g. when the
 *   selected account/category or active filters change). It intentionally does
 *   NOT reset when the list merely grows (appended server pages).
 * - `onReachEnd` — called when the sentinel is reached and everything already
 *   loaded is visible (used to trigger fetching the next server page).
 */
export function useProgressiveReveal(
  totalCount: number,
  options?: {
    initial?: number;
    step?: number;
    resetKey?: string;
    rootMargin?: string;
    onReachEnd?: () => void;
  },
): {
  visibleCount: number;
  hasMore: boolean;
  sentinelRef: (node: HTMLElement | null) => void;
} {
  const initial = options?.initial ?? 60;
  const step = options?.step ?? 60;
  const resetKey = options?.resetKey ?? "";
  const rootMargin = options?.rootMargin ?? "600px 0px";

  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(initial, totalCount),
  );

  const totalRef = useRef(totalCount);
  totalRef.current = totalCount;
  const visibleCountRef = useRef(visibleCount);
  visibleCountRef.current = visibleCount;
  const onReachEndRef = useRef(options?.onReachEnd);
  onReachEndRef.current = options?.onReachEnd;
  const sentinelNodeRef = useRef<HTMLElement | null>(null);
  const intersectingRef = useRef(false);
  const stepRef = useRef(step);
  stepRef.current = step;

  // Reset the window when the underlying query changes (new entity / filters).
  useEffect(() => {
    setVisibleCount(Math.min(initial, totalRef.current));
  }, [resetKey, initial]);

  // Keep the window within [floor, total]. Grows the floor to `initial` once
  // data arrives; clamps down if the list shrinks. Does not shrink an
  // already-expanded window when more rows are appended.
  useEffect(() => {
    setVisibleCount((current) => {
      const floor = Math.min(initial, totalCount);
      return Math.min(Math.max(current, floor), Math.max(totalCount, 0));
    });
  }, [totalCount, initial]);

  /**
   * IntersectionObserver only fires on threshold transitions. Revealing more
   * rows pushes the sentinel down while it can stay inside `rootMargin`, so
   * `isIntersecting` never flips and loading stalls mid-list. Drain while the
   * sentinel remains in range (and again when totals grow after a server page).
   */
  const drainWhileIntersecting = useCallback(() => {
    if (!intersectingRef.current) return;
    if (visibleCountRef.current < totalRef.current) {
      setVisibleCount((current) =>
        Math.min(current + stepRef.current, totalRef.current),
      );
      return;
    }
    onReachEndRef.current?.();
  }, []);

  useEffect(() => {
    drainWhileIntersecting();
  }, [visibleCount, totalCount, drainWhileIntersecting]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      sentinelNodeRef.current = node;
      intersectingRef.current = false;
      if (!node || typeof IntersectionObserver === "undefined") return;
      const observer = new IntersectionObserver(
        (entries) => {
          const intersecting = entries.some((entry) => entry.isIntersecting);
          intersectingRef.current = intersecting;
          if (!intersecting) return;
          drainWhileIntersecting();
        },
        { rootMargin },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [drainWhileIntersecting, rootMargin],
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return {
    visibleCount,
    hasMore: visibleCount < totalCount,
    sentinelRef,
  };
}
