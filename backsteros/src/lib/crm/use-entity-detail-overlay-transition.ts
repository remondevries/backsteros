import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  useOverlayLayoutCrossFade,
  type EntityOverlayLayout,
} from "./use-overlay-layout-cross-fade";

export type { EntityOverlayLayout };

export type EntityDetailOverlayDurations = {
  /** List ↔ page-workspace fade before the layout navigation. */
  expandFadeMs: number;
  /** Detail panel slide (hide / show / close). */
  collapseMs: number;
  /** Card content cross-fade when switching entities. */
  contentFadeMs: number;
};

type Navigate = (to: string, options?: { replace?: boolean }) => void;

/**
 * Detail overlay chrome for a list + detail CRM screen: expand to the page
 * workspace, collapse back to the panel, hide / show the panel, close, and
 * cross-fade card content when the selection changes.
 *
 * Hrefs are passed to the actions (not the hook) so screens can build them
 * from values computed later in render.
 */
export function useEntityDetailOverlayTransition({
  overlayLayout,
  selectedId,
  routeHasSelection,
  navigate,
  durations,
}: {
  overlayLayout: EntityOverlayLayout;
  selectedId: string | null;
  /** False once the route truly leaves the entity (no slug). */
  routeHasSelection: boolean;
  navigate: Navigate;
  durations: EntityDetailOverlayDurations;
}) {
  const { expandFadeMs, collapseMs, contentFadeMs } = durations;
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [detailCollapseAnimating, setDetailCollapseAnimating] = useState(false);
  const detailCollapseAnimTimerRef = useRef<number | null>(null);
  const detailCollapseRafRef = useRef<number | null>(null);
  const detailCloseNavTimerRef = useRef<number | null>(null);
  const detailCollapsedRef = useRef(detailCollapsed);
  detailCollapsedRef.current = detailCollapsed;
  /** Entity id shown in the panel — lags `selectedId` during switch fade. */
  const [panelEntityId, setPanelEntityId] = useState<string | null>(
    selectedId,
  );
  const [contentFaded, setContentFaded] = useState(false);
  const contentFadeTokenRef = useRef(0);
  /** List opacity during expand / collapse to the page workspace. */
  const [listFaded, setListFaded] = useState(() => overlayLayout === "page");
  /** Expanded workspace opacity during expand / collapse. */
  const [workspaceFaded, setWorkspaceFaded] = useState(false);
  const overlayLayoutRef = useRef(overlayLayout);
  overlayLayoutRef.current = overlayLayout;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const {
    expand,
    collapse,
    cancel: cancelCrossFade,
  } = useOverlayLayoutCrossFade({
    overlayLayout,
    fadeMs: expandFadeMs,
    setListFaded,
    setWorkspaceFaded,
    restoreOnDirectPanel: selectedId == null,
  });

  /** Fade the list out, then navigate to the page-layout href. */
  const expandOverlay = useCallback(
    (pageHref: string) => {
      if (overlayLayoutRef.current === "page") return;
      setDetailCollapsed(false);
      expand(() => navigateRef.current(pageHref, { replace: true }));
    },
    [expand],
  );

  /** Fade the page workspace out, then navigate to the panel-layout href. */
  const collapseOverlay = useCallback(
    (panelHref: string) => {
      setDetailCollapsed(false);
      if (overlayLayoutRef.current !== "page") {
        navigateRef.current(panelHref, { replace: true });
        return;
      }
      collapse(() => navigateRef.current(panelHref, { replace: true }));
    },
    [collapse],
  );

  const beginDetailCollapseAnimation = useCallback(
    (apply: () => void) => {
      setDetailCollapseAnimating(true);
      if (detailCollapseAnimTimerRef.current != null) {
        window.clearTimeout(detailCollapseAnimTimerRef.current);
        detailCollapseAnimTimerRef.current = null;
      }
      if (detailCollapseRafRef.current != null) {
        window.cancelAnimationFrame(detailCollapseRafRef.current);
        detailCollapseRafRef.current = null;
      }
      // Enable transition for one paint, then flip collapsed so width interpolates.
      detailCollapseRafRef.current = window.requestAnimationFrame(() => {
        detailCollapseRafRef.current = window.requestAnimationFrame(() => {
          detailCollapseRafRef.current = null;
          apply();
          detailCollapseAnimTimerRef.current = window.setTimeout(() => {
            detailCollapseAnimTimerRef.current = null;
            setDetailCollapseAnimating(false);
          }, collapseMs);
        });
      });
    },
    [collapseMs],
  );

  useEffect(() => {
    const collapseTimer = detailCollapseAnimTimerRef;
    const collapseRaf = detailCollapseRafRef;
    const closeNavTimer = detailCloseNavTimerRef;
    return () => {
      if (collapseTimer.current != null) {
        window.clearTimeout(collapseTimer.current);
      }
      if (collapseRaf.current != null) {
        window.cancelAnimationFrame(collapseRaf.current);
      }
      if (closeNavTimer.current != null) {
        window.clearTimeout(closeNavTimer.current);
      }
    };
  }, []);

  const hideDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(true);
    });
  }, [beginDetailCollapseAnimation]);

  const showDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(false);
    });
  }, [beginDetailCollapseAnimation]);

  const toggleDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed((current) => !current);
    });
  }, [beginDetailCollapseAnimation]);

  /** Slide the panel closed, then navigate to `closeHref`. */
  const closeOverlay = useCallback(
    (closeHref: string) => {
      if (detailCloseNavTimerRef.current != null) {
        window.clearTimeout(detailCloseNavTimerRef.current);
        detailCloseNavTimerRef.current = null;
      }

      const leave = () => {
        cancelCrossFade();
        setListFaded(false);
        setWorkspaceFaded(false);
        setDetailCollapsed(false);
        navigateRef.current(closeHref, { replace: true });
      };

      // Already on the reopen strip — leave immediately.
      if (detailCollapsedRef.current) {
        leave();
        return;
      }

      // Slide closed, then navigate so Escape matches `]` hide animation.
      beginDetailCollapseAnimation(() => {
        setDetailCollapsed(true);
      });
      detailCloseNavTimerRef.current = window.setTimeout(() => {
        detailCloseNavTimerRef.current = null;
        leave();
      }, collapseMs);
    },
    [beginDetailCollapseAnimation, cancelCrossFade, collapseMs],
  );

  // Clearing the selection reopens the panel for the next pick; switching
  // while the reopen strip shows keeps the strip.
  useEffect(() => {
    if (!selectedId) setDetailCollapsed(false);
  }, [selectedId]);

  // Opacity crossfade when switching entities while the panel is open.
  // useLayoutEffect so fade-out starts before paint (no flash of new chrome).
  useLayoutEffect(() => {
    const nextId = selectedId;
    if (nextId === panelEntityId) return;

    // Route can briefly miss a match while keep-alive href flips — keep the
    // current card mounted so we don't abort mid-fade / remount the rail.
    if (nextId == null) return;

    const canFade =
      panelEntityId != null && !detailCollapsed && !detailCollapseAnimating;

    if (!canFade) {
      contentFadeTokenRef.current += 1;
      setPanelEntityId(nextId);
      setContentFaded(false);
      return;
    }

    const token = ++contentFadeTokenRef.current;
    setContentFaded(true);
    const timer = window.setTimeout(() => {
      if (contentFadeTokenRef.current !== token) return;
      setPanelEntityId(nextId);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (contentFadeTokenRef.current !== token) return;
          setContentFaded(false);
        });
      });
    }, contentFadeMs);

    return () => window.clearTimeout(timer);
  }, [
    contentFadeMs,
    detailCollapseAnimating,
    detailCollapsed,
    panelEntityId,
    selectedId,
  ]);

  // Close the panel only when the route truly leaves the entity (no slug).
  useLayoutEffect(() => {
    if (routeHasSelection) return;
    contentFadeTokenRef.current += 1;
    cancelCrossFade();
    setPanelEntityId(null);
    setContentFaded(false);
    setListFaded(false);
    setWorkspaceFaded(false);
    setDetailCollapsed(false);
  }, [cancelCrossFade, routeHasSelection]);

  return {
    detailCollapsed,
    setDetailCollapsed,
    detailCollapseAnimating,
    panelEntityId,
    contentFaded,
    listFaded,
    workspaceFaded,
    expandOverlay,
    collapseOverlay,
    hideDetail,
    showDetail,
    toggleDetail,
    closeOverlay,
  };
}
