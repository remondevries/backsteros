import { useCallback, useEffect, useRef, useState } from "react";

import { createPanelWidthNudger, type PanelWidthNudger } from "./panel-width-nudge";
import {
  TASK_DETAIL_SIDE_PANEL_NUDGE_STEP,
  TASK_LAYOUT_COLUMN_MIN_WIDTH,
} from "./task-detail-side-panel-layout";

/** @deprecated Legacy global key — used only as a one-time fallback. */
export const CODEBASE_SIDE_PANEL_WIDTH_KEY =
  "backsteros-desktop.codebase-side-panel-width";

const CODEBASE_SIDE_PANEL_WIDTH_KEY_PREFIX =
  "backsteros-desktop.codebase-side-panel-width.project.";

/** Same 380px floor as codebase task columns. */
export const CODEBASE_SIDE_PANEL_MIN_WIDTH = TASK_LAYOUT_COLUMN_MIN_WIDTH;
export const CODEBASE_SIDE_PANEL_DEFAULT_WIDTH = TASK_LAYOUT_COLUMN_MIN_WIDTH;
/** Right (detail) column floor — mirrors task agent-panel min. */
export const CODEBASE_DETAIL_PANEL_MIN_WIDTH = TASK_LAYOUT_COLUMN_MIN_WIDTH;
/** @deprecated Absolute max removed; clamp leaves room for the detail column. */
export const CODEBASE_SIDE_PANEL_MAX_WIDTH = 640;
export const CODEBASE_SIDE_PANEL_NUDGE_STEP = TASK_DETAIL_SIDE_PANEL_NUDGE_STEP;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** localStorage key for a project’s remembered overview panel width. */
export function codebaseSidePanelWidthKey(projectId: string): string {
  return `${CODEBASE_SIDE_PANEL_WIDTH_KEY_PREFIX}${projectId}`;
}

function readStoredWidth(storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(parsed)) return null;
    return Math.max(parsed, CODEBASE_SIDE_PANEL_MIN_WIDTH);
  } catch {
    return null;
  }
}

export function readCodebaseSidePanelWidth(projectId: string): number {
  if (projectId) {
    const stored = readStoredWidth(codebaseSidePanelWidthKey(projectId));
    if (stored != null) return stored;
  }
  // One-time fallback for widths saved before per-project keys.
  const legacy = readStoredWidth(CODEBASE_SIDE_PANEL_WIDTH_KEY);
  if (legacy != null) return legacy;
  return CODEBASE_SIDE_PANEL_DEFAULT_WIDTH;
}

export function writeCodebaseSidePanelWidth(
  projectId: string,
  width: number,
): void {
  if (typeof window === "undefined" || !projectId) return;
  try {
    window.localStorage.setItem(
      codebaseSidePanelWidthKey(projectId),
      String(Math.round(Math.max(width, CODEBASE_SIDE_PANEL_MIN_WIDTH))),
    );
  } catch {
    /* ignore quota */
  }
}

/**
 * Clamp the overview column so neither side goes below the shared 380px floor
 * (same rule as codebase task ↔ agent split).
 */
export function clampCodebaseSidePanelWidth(
  width: number,
  containerWidth: number,
): number {
  if (!(Number.isFinite(containerWidth) && containerWidth > 0)) {
    return Math.max(width, CODEBASE_SIDE_PANEL_MIN_WIDTH);
  }
  const maxWidth = Math.max(
    CODEBASE_SIDE_PANEL_MIN_WIDTH,
    containerWidth - CODEBASE_DETAIL_PANEL_MIN_WIDTH,
  );
  return clamp(width, CODEBASE_SIDE_PANEL_MIN_WIDTH, maxWidth);
}

/**
 * Tracks and persists the left codebase overview panel width with drag + keyboard nudge.
 * Remembers width per `projectId` (falls back to the legacy shared key once).
 */
export function useCodebaseSidePanelWidth(projectId: string): {
  containerRef: (node: HTMLDivElement | null) => void;
  panelWidth: number;
  beginResize: (clientX: number) => void;
  /** Nudge left-panel width by `delta` px (clamped + persisted). Returns whether width changed. */
  nudgePanelWidth: (delta: number) => boolean;
  isResizing: boolean;
} {
  const containerElRef = useRef<HTMLDivElement | null>(null);
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(
    null,
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const [panelWidth, setPanelWidthState] = useState(() =>
    readCodebaseSidePanelWidth(projectId),
  );
  const [isResizing, setIsResizing] = useState(false);
  const panelWidthRef = useRef(panelWidth);
  const containerWidthRef = useRef(containerWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const projectIdRef = useRef(projectId);
  const persistTimerRef = useRef<number | null>(null);
  const nudgerRef = useRef<PanelWidthNudger | null>(null);

  projectIdRef.current = projectId;
  containerWidthRef.current = containerWidth;

  const applyVisualWidth = useCallback((width: number) => {
    panelWidthRef.current = width;
    const container = containerElRef.current;
    if (container) {
      container.style.setProperty(
        "--desktop-codebase-side-panel-width",
        `${width}px`,
      );
    }
  }, []);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerElRef.current = node;
    setContainerNode(node);
    if (!node) {
      setContainerWidth(0);
      return;
    }
    setContainerWidth(Math.round(node.getBoundingClientRect().width));
    node.style.setProperty(
      "--desktop-codebase-side-panel-width",
      `${panelWidthRef.current}px`,
    );
  }, []);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  const persistPanelWidth = useCallback((width: number, immediate = false) => {
    const projectIdNow = projectIdRef.current;
    const rounded = Math.round(width);
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (immediate) {
      writeCodebaseSidePanelWidth(projectIdNow, rounded);
      return;
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      writeCodebaseSidePanelWidth(projectIdNow, rounded);
    }, 180);
  }, []);

  useEffect(() => {
    const nudger = createPanelWidthNudger({
      getWidth: () => panelWidthRef.current,
      setWidth: (width) => {
        applyVisualWidth(width);
      },
      clampWidth: (width) =>
        clampCodebaseSidePanelWidth(
          width,
          containerElRef.current?.clientWidth ?? containerWidthRef.current,
        ),
      onSettle: (width) => {
        const rounded = Math.round(width);
        applyVisualWidth(rounded);
        setPanelWidthState(rounded);
        persistPanelWidth(rounded);
      },
      ease: 0.18,
    });
    nudgerRef.current = nudger;
    return () => {
      nudger.cancel();
      if (nudgerRef.current === nudger) nudgerRef.current = null;
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, [applyVisualWidth, persistPanelWidth]);

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

  // Apply per-project memory (or default) when project / size changes.
  useEffect(() => {
    const next = clampCodebaseSidePanelWidth(
      readCodebaseSidePanelWidth(projectId),
      containerWidth,
    );
    applyVisualWidth(next);
    setPanelWidthState(next);
    nudgerRef.current?.sync(next);
  }, [projectId, containerWidth, applyVisualWidth]);

  const beginResize = useCallback(
    (clientX: number) => {
      nudgerRef.current?.cancel();
      nudgerRef.current?.sync(panelWidthRef.current);
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
          containerElRef.current?.clientWidth ?? containerWidthRef.current,
        );
        applyVisualWidth(next);
        setPanelWidthState(next);
        nudgerRef.current?.sync(next);
      };

      const onUp = () => {
        dragRef.current = null;
        setIsResizing(false);
        document.body.classList.remove("is-resizing");
        document.body.style.userSelect = previousUserSelect;
        persistPanelWidth(panelWidthRef.current, true);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [applyVisualWidth, persistPanelWidth],
  );

  const nudgePanelWidth = useCallback((delta: number) => {
    return nudgerRef.current?.nudge(delta) ?? false;
  }, []);

  return {
    containerRef,
    panelWidth,
    beginResize,
    nudgePanelWidth,
    isResizing,
  };
}

