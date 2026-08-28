"use client";

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import {
  computeOverlayScrollbarThumb,
  resolveOverlayScrollbarTarget,
} from "./overlay-scrollbar.js";

/** How long after the last scroll event before the thumb fades out. */
export const OVERLAY_SCROLLBAR_IDLE_MS = 1000;

type OverlayScrollbarState = {
  needed: boolean;
  active: boolean;
  thumbTop: number;
  thumbHeight: number;
};

const HIDDEN: OverlayScrollbarState = {
  needed: false,
  active: false,
  thumbTop: 0,
  thumbHeight: 0,
};

/**
 * macOS-style overlay scrollbar for overview list scrollports.
 * Hides when content fits; shows a thin thumb while scrolling, then fades.
 *
 * `scrollPortRef` should point at the element that scrolls (or contains
 * `.legend-list-scroll` for virtualized lists). The thumb is rendered as a
 * sibling overlay by the caller, not inside this hook.
 */
export function useOverlayScrollbar(
  scrollPortRef: RefObject<HTMLElement | null>,
): {
  needed: boolean;
  active: boolean;
  thumbStyle: CSSProperties;
} {
  const [state, setState] = useState<OverlayScrollbarState>(HIDDEN);

  const measure = useCallback((target: HTMLElement, activate: boolean) => {
    const metrics = computeOverlayScrollbarThumb({
      viewport: target.clientHeight,
      content: target.scrollHeight,
      scrollTop: target.scrollTop,
    });
    setState((current) => ({
      needed: metrics.visible,
      active: metrics.visible ? (activate ? true : current.active) : false,
      thumbTop: metrics.thumbTop,
      thumbHeight: metrics.thumbHeight,
    }));
  }, []);

  useEffect(() => {
    const port = scrollPortRef.current;
    if (!port) {
      setState(HIDDEN);
      return;
    }

    let target: HTMLElement | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const clearIdle = () => {
      if (idleTimer != null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const scheduleIdle = () => {
      clearIdle();
      idleTimer = setTimeout(() => {
        idleTimer = null;
        setState((current) =>
          current.active ? { ...current, active: false } : current,
        );
      }, OVERLAY_SCROLLBAR_IDLE_MS);
    };

    const onScroll = () => {
      if (!target) return;
      measure(target, true);
      scheduleIdle();
    };

    const bindTarget = (next: HTMLElement) => {
      if (target === next) {
        measure(next, false);
        return;
      }
      if (target) {
        target.removeEventListener("scroll", onScroll);
        resizeObserver?.unobserve(target);
      }
      target = next;
      target.addEventListener("scroll", onScroll, { passive: true });
      resizeObserver?.observe(target);
      measure(next, false);
    };

    const syncTarget = () => {
      bindTarget(resolveOverlayScrollbarTarget(port));
    };

    resizeObserver = new ResizeObserver(() => {
      if (target) measure(target, false);
    });
    resizeObserver.observe(port);

    syncTarget();

    // Rebind only when the resolved scroller identity changes (e.g. virtual
    // list mounts). Ignore churn from row recycling inside LegendList.
    const mutationObserver = new MutationObserver(() => {
      const next = resolveOverlayScrollbarTarget(port);
      if (next !== target) {
        bindTarget(next);
      }
    });
    mutationObserver.observe(port, { childList: true, subtree: true });

    return () => {
      clearIdle();
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      target?.removeEventListener("scroll", onScroll);
    };
  }, [measure, scrollPortRef]);

  const thumbStyle: CSSProperties = {
    transform: `translateY(${state.thumbTop}px)`,
    height: state.thumbHeight,
  };

  return {
    needed: state.needed,
    active: state.active,
    thumbStyle,
  };
}
