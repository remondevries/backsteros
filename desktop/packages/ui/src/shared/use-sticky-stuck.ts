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

function stickyTopOffsetPx(sentinel: HTMLElement): number {
  const header = sentinel.nextElementSibling;
  if (!(header instanceof HTMLElement)) return 0;
  const top = Number.parseFloat(getComputedStyle(header).top);
  return Number.isFinite(top) && top > 0 ? top : 0;
}

/**
 * Detects when a sticky header is stuck in its scroll container.
 * Attach `sentinelRef` to a 1×1 marker at the top of the sticky section
 * (sibling before the sticky header). When that sentinel scrolls out above
 * the header's sticky `top` inset, the header is stuck.
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
    const topInset = stickyTopOffsetPx(sentinel);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setStuck(!entry.isIntersecting);
      },
      {
        root,
        threshold: 0,
        // Shrink the root top by the sticky inset so "stuck" matches top ≠ 0.
        rootMargin: topInset > 0 ? `-${topInset}px 0px 0px 0px` : "0px",
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel]);

  return { stuck, sentinelRef: setSentinel };
}
