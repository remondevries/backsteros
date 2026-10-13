"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import {
  computeOverlayScrollbarFixedBox,
  computeOverlayScrollbarThumb,
  resolveScrollEventTarget,
  shouldTrackOverlayScrollbar,
} from "../../list-nav/overlay-scrollbar.js";
import { OVERLAY_SCROLLBAR_IDLE_MS } from "../../list-nav/use-overlay-scrollbar.js";

type ThumbState = {
  active: boolean;
  visible: boolean;
  style: CSSProperties;
};

const HIDDEN: ThumbState = {
  active: false,
  visible: false,
  style: {},
};

function measureTarget(target: HTMLElement): ThumbState {
  const metrics = computeOverlayScrollbarThumb({
    viewport: target.clientHeight,
    content: target.scrollHeight,
    scrollTop: target.scrollTop,
  });
  if (!metrics.visible) {
    return HIDDEN;
  }
  const rect = target.getBoundingClientRect();
  const box = computeOverlayScrollbarFixedBox({
    portTop: rect.top,
    portRight: rect.right,
    thumbTop: metrics.thumbTop,
    thumbHeight: metrics.thumbHeight,
  });
  return {
    active: true,
    visible: true,
    style: {
      top: box.top,
      left: box.left,
      width: box.width,
      height: box.height,
    },
  };
}

/**
 * App-wide macOS-style overlay scrollbar. Listens for vertical scroll in
 * capture phase and paints one fixed thumb over the active scrollport.
 * Opt out with `data-overlay-scrollbar="off"` on a scroller or ancestor.
 */
export function OverlayScrollbarRoot() {
  const [state, setState] = useState<ThumbState>(HIDDEN);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let activeTarget: HTMLElement | null = null;
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

    const paint = (target: HTMLElement, activate: boolean) => {
      if (!shouldTrackOverlayScrollbar(target)) {
        if (activeTarget === target) {
          if (activeTarget) resizeObserver?.unobserve(activeTarget);
          activeTarget = null;
          setState(HIDDEN);
        }
        return;
      }
      const next = measureTarget(target);
      if (!next.visible) {
        if (activeTarget === target) {
          if (activeTarget) resizeObserver?.unobserve(activeTarget);
          activeTarget = null;
          setState(HIDDEN);
        }
        return;
      }
      if (activeTarget !== target) {
        if (activeTarget) resizeObserver?.unobserve(activeTarget);
        resizeObserver?.observe(target);
        activeTarget = target;
      }
      setState((current) => ({
        ...next,
        active: activate ? true : current.active && current.visible,
      }));
      if (activate) scheduleIdle();
    };

    const onScroll = (event: Event) => {
      const target = resolveScrollEventTarget(event.target);
      if (!target) return;
      paint(target, true);
    };

    const onViewportChange = () => {
      if (activeTarget) paint(activeTarget, false);
    };

    resizeObserver = new ResizeObserver(onViewportChange);
    // Observe the shell so layout changes (side panel, resize) reposition the thumb.
    const shell = document.querySelector(".bos-product-shell");
    if (shell instanceof HTMLElement) {
      resizeObserver.observe(shell);
    }

    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", onViewportChange);

    return () => {
      clearIdle();
      resizeObserver?.disconnect();
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, []);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  if (!state.visible) {
    return null;
  }

  return createPortal(
    <div
      className={`overlay-scrollbar-thumb${state.active ? " is-active" : ""}`}
      style={state.style}
      aria-hidden="true"
    />,
    document.body,
  );
}
