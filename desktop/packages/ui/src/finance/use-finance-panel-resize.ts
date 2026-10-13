"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

const DEFAULT_MIN_WIDTH = 320;

/**
 * Shared CSS variable the detail pane and the breadcrumb trailing panel both
 * read, so the two stay a single visual unit while dragging. Kept on
 * `:root` because the chrome header lives outside the finance view subtree.
 */
const DETAIL_WIDTH_CSS_VAR = "--finance-cat-detail-w";

function readStoredWidth(storageKey: string, minWidth: number): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(parsed)) return null;
    return Math.max(parsed, minWidth);
  } catch {
    return null;
  }
}

function writeStoredWidth(storageKey: string, width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(Math.round(width)));
  } catch {
    /* ignore quota */
  }
}

function removeStoredWidth(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

/**
 * Drag-to-resize behavior for finance detail side panels (categories, accounts).
 *
 * Tracks a persisted detail-pane width; when null the panel falls back to the
 * default 50/50 flex split. Attach `containerRef` to the split root,
 * `detailPaneRef` to the detail pane, and call `beginResize` from the drag
 * handle's pointer-down. `resetWidth` clears the stored width (double-click).
 */
export function useFinancePanelResize(
  storageKey: string,
  options?: { minWidth?: number; otherMinWidth?: number },
): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  detailPaneRef: React.RefObject<HTMLDivElement | null>;
  detailWidth: number | null;
  isResized: boolean;
  beginResize: (clientX: number) => void;
  resetWidth: () => void;
} {
  const minWidth = options?.minWidth ?? DEFAULT_MIN_WIDTH;
  const otherMinWidth = options?.otherMinWidth ?? DEFAULT_MIN_WIDTH;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const detailPaneRef = useRef<HTMLDivElement | null>(null);
  const [detailWidth, setDetailWidth] = useState<number | null>(() =>
    readStoredWidth(storageKey, minWidth),
  );
  const detailWidthRef = useRef(detailWidth);
  detailWidthRef.current = detailWidth;

  // Mirror the width onto :root so the breadcrumb trailing panel (rendered in
  // the chrome header, outside this subtree) resizes in lockstep with the pane.
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (detailWidth != null) {
      root.style.setProperty(DETAIL_WIDTH_CSS_VAR, `${Math.round(detailWidth)}px`);
    } else {
      root.style.removeProperty(DETAIL_WIDTH_CSS_VAR);
    }
    return () => {
      root.style.removeProperty(DETAIL_WIDTH_CSS_VAR);
    };
  }, [detailWidth]);

  const beginResize = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.clientWidth;
      const startX = clientX;
      const startWidth =
        detailWidthRef.current ??
        detailPaneRef.current?.getBoundingClientRect().width ??
        containerWidth / 2;
      document.body.classList.add("is-resizing");
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const onMove = (event: PointerEvent) => {
        const maxDetail = Math.max(
          minWidth,
          containerWidth - otherMinWidth,
        );
        const next = Math.min(
          maxDetail,
          Math.max(minWidth, startWidth - (event.clientX - startX)),
        );
        setDetailWidth(next);
      };
      const onUp = () => {
        document.body.classList.remove("is-resizing");
        document.body.style.userSelect = previousUserSelect;
        if (detailWidthRef.current != null) {
          writeStoredWidth(storageKey, detailWidthRef.current);
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [minWidth, otherMinWidth, storageKey],
  );

  const resetWidth = useCallback(() => {
    setDetailWidth(null);
    removeStoredWidth(storageKey);
  }, [storageKey]);

  return {
    containerRef,
    detailPaneRef,
    detailWidth,
    isResized: detailWidth != null,
    beginResize,
    resetWidth,
  };
}
