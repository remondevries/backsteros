import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

export type EntityOverlayLayout = "panel" | "page";

function clearTimer(timerRef: { current: number | null }) {
  if (timerRef.current != null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

/**
 * Cross-fade between a list (or chat column) and an expanded page workspace.
 * `expand` / `collapse` fade the outgoing side, then call `commit` to switch
 * the layout; the incoming side fades in after the layout change paints.
 *
 * Setters must be stable (state setters or ref-backed callbacks).
 */
export function useOverlayLayoutCrossFade({
  overlayLayout,
  fadeMs,
  setListFaded,
  setWorkspaceFaded,
  restoreOnDirectPanel,
}: {
  overlayLayout: EntityOverlayLayout;
  fadeMs: number;
  setListFaded: (faded: boolean) => void;
  setWorkspaceFaded: (faded: boolean) => void;
  /**
   * Reaching the panel layout without an animated collapse (breadcrumb,
   * Escape): restore both sides so nothing is left at opacity 0.
   */
  restoreOnDirectPanel: boolean;
}) {
  const tokenRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const pendingWorkspaceFadeInRef = useRef(false);
  const pendingListFadeInRef = useRef(false);

  /** Fade the list out, then `commit` the switch to the page layout. */
  const expand = useCallback(
    (commit: () => void) => {
      const token = ++tokenRef.current;
      pendingListFadeInRef.current = false;
      pendingWorkspaceFadeInRef.current = true;
      setListFaded(true);
      clearTimer(timerRef);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (tokenRef.current !== token) return;
        setWorkspaceFaded(true);
        commit();
      }, fadeMs);
    },
    [fadeMs, setListFaded, setWorkspaceFaded],
  );

  /** Fade the workspace out, then `commit` the switch to the panel layout. */
  const collapse = useCallback(
    (commit: () => void) => {
      const token = ++tokenRef.current;
      pendingWorkspaceFadeInRef.current = false;
      pendingListFadeInRef.current = true;
      setWorkspaceFaded(true);
      clearTimer(timerRef);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (tokenRef.current !== token) return;
        setListFaded(true);
        commit();
      }, fadeMs);
    },
    [fadeMs, setListFaded, setWorkspaceFaded],
  );

  /** Abandon any in-flight fade (close / route leave). */
  const cancel = useCallback(() => {
    tokenRef.current += 1;
    pendingListFadeInRef.current = false;
    pendingWorkspaceFadeInRef.current = false;
    clearTimer(timerRef);
  }, []);

  // After expand switches to page: fade the workspace in.
  useLayoutEffect(() => {
    if (overlayLayout !== "page") return;
    if (!pendingWorkspaceFadeInRef.current) {
      setListFaded(true);
      return;
    }
    pendingWorkspaceFadeInRef.current = false;
    setWorkspaceFaded(true);
    setListFaded(true);
    const token = tokenRef.current;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (tokenRef.current !== token) return;
        setWorkspaceFaded(false);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [overlayLayout, setListFaded, setWorkspaceFaded]);

  // After collapse switches to panel: fade the list back in.
  useLayoutEffect(() => {
    if (overlayLayout !== "panel") return;
    if (!pendingListFadeInRef.current) {
      if (restoreOnDirectPanel) {
        setListFaded(false);
        setWorkspaceFaded(false);
      }
      return;
    }
    pendingListFadeInRef.current = false;
    setListFaded(true);
    setWorkspaceFaded(false);
    const token = tokenRef.current;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (tokenRef.current !== token) return;
        setListFaded(false);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [overlayLayout, restoreOnDirectPanel, setListFaded, setWorkspaceFaded]);

  useEffect(() => {
    const timer = timerRef;
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  return { expand, collapse, cancel };
}
