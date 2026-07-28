import { useCallback, useEffect, useRef, useState } from "react";

/** Persisted width for codebase left side panels (project workbench + task detail). */
export const CODEBASE_SIDE_PANEL_WIDTH_KEY =
  "backsteros-desktop.codebase-side-panel-width";

export const CODEBASE_SIDE_PANEL_MIN_WIDTH = 280;
export const CODEBASE_SIDE_PANEL_DEFAULT_WIDTH = 380;
export const CODEBASE_SIDE_PANEL_MAX_WIDTH = 640;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function readCodebaseSidePanelWidth(): number {
  if (typeof window === "undefined") {
    return CODEBASE_SIDE_PANEL_DEFAULT_WIDTH;
  }
  try {
    const raw = window.localStorage.getItem(CODEBASE_SIDE_PANEL_WIDTH_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(parsed)) return CODEBASE_SIDE_PANEL_DEFAULT_WIDTH;
    return clamp(
      parsed,
      CODEBASE_SIDE_PANEL_MIN_WIDTH,
      CODEBASE_SIDE_PANEL_MAX_WIDTH,
    );
  } catch {
    return CODEBASE_SIDE_PANEL_DEFAULT_WIDTH;
  }
}

export function writeCodebaseSidePanelWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CODEBASE_SIDE_PANEL_WIDTH_KEY,
      String(
        Math.round(
          clamp(
            width,
            CODEBASE_SIDE_PANEL_MIN_WIDTH,
            CODEBASE_SIDE_PANEL_MAX_WIDTH,
          ),
        ),
      ),
    );
  } catch {
    /* ignore quota */
  }
}

export function clampCodebaseSidePanelWidth(
  width: number,
  containerWidth: number,
): number {
  const ratioMax =
    Number.isFinite(containerWidth) && containerWidth > 0
      ? Math.floor(containerWidth * 0.55)
      : CODEBASE_SIDE_PANEL_MAX_WIDTH;
  const maxWidth = Math.max(
    CODEBASE_SIDE_PANEL_MIN_WIDTH,
    Math.min(CODEBASE_SIDE_PANEL_MAX_WIDTH, ratioMax),
  );
  return clamp(width, CODEBASE_SIDE_PANEL_MIN_WIDTH, maxWidth);
}

/**
 * Tracks and persists the left codebase side-panel width with drag-to-resize.
 */
export function useCodebaseSidePanelWidth(): {
  containerRef: (node: HTMLDivElement | null) => void;
  panelWidth: number;
  beginResize: (clientX: number) => void;
  isResizing: boolean;
} {
  const containerElRef = useRef<HTMLDivElement | null>(null);
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(
    null,
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const [panelWidth, setPanelWidthState] = useState(() =>
    readCodebaseSidePanelWidth(),
  );
  const [isResizing, setIsResizing] = useState(false);
  const panelWidthRef = useRef(panelWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerElRef.current = node;
    setContainerNode(node);
    if (!node) {
      setContainerWidth(0);
      return;
    }
    setContainerWidth(Math.round(node.getBoundingClientRect().width));
  }, []);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    const node = containerNode;
    if (!node || typeof ResizeObserver === "undefined") return;
    const update = () => {
      setContainerWidth(Math.round(node.getBoundingClientRect().width));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerNode]);

  useEffect(() => {
    if (containerWidth <= 0) return;
    setPanelWidthState((prev) =>
      clampCodebaseSidePanelWidth(prev, containerWidth),
    );
  }, [containerWidth]);

  const beginResize = useCallback(
    (clientX: number) => {
      dragRef.current = {
        startX: clientX,
        startWidth: panelWidthRef.current,
      };
      setIsResizing(true);
      document.body.classList.add("is-resizing");
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const onMove = (event: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const next = clampCodebaseSidePanelWidth(
          drag.startWidth + (event.clientX - drag.startX),
          containerElRef.current?.clientWidth ?? containerWidth,
        );
        panelWidthRef.current = next;
        setPanelWidthState(next);
      };

      const onUp = () => {
        dragRef.current = null;
        setIsResizing(false);
        document.body.classList.remove("is-resizing");
        document.body.style.userSelect = previousUserSelect;
        writeCodebaseSidePanelWidth(panelWidthRef.current);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [containerWidth],
  );

  return {
    containerRef,
    panelWidth,
    beginResize,
    isResizing,
  };
}
