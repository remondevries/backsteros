"use client";

import { useEffect, useState, type RefCallback } from "react";

function getOverflowScrollParent(node: HTMLElement | null): Element | null {
  let parent = node?.parentElement ?? null;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Detects when a `position: sticky; top: 0` header is stuck to the top of its
 * scroll container. Attach `sentinelRef` to a 1×1 marker at the top of the
 * sticky section (sibling before the sticky header). When that sentinel scrolls
 * out of view upward, the header is stuck.
 */
export function useStickyStuck(): {
  stuck: boolean;
  sentinelRef: RefCallback<HTMLElement | null>;
} {
  const [stuck, setStuck] = useState(false);
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      setStuck(false);
      return;
    }

    const root = getOverflowScrollParent(sentinel);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setStuck(!entry.isIntersecting);
      },
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel]);

  return { stuck, sentinelRef: setSentinel };
}
