import { useCallback, useEffect, useRef, useState } from "react";

import { createPanelWidthNudger, type PanelWidthNudger } from "./panel-width-nudge";

/** @deprecated Legacy shared key — unused; widths are per-task now. */
export const TASK_DETAIL_SIDE_PANEL_WIDTH_KEY =
  "backsteros-desktop.task-detail-side-panel-width";

/** @deprecated Legacy type-scoped key — unused; widths are per-task now. */
export const TASK_DETAIL_SIDE_PANEL_WIDTH_KEY_NARROW =
  "backsteros-desktop.task-detail-side-panel-width.narrow";

/** @deprecated Legacy type-scoped key — unused; widths are per-task now. */
export const TASK_DETAIL_SIDE_PANEL_WIDTH_KEY_WIDE =
  "backsteros-desktop.task-detail-side-panel-width.wide";

const TASK_DETAIL_SIDE_PANEL_WIDTH_KEY_PREFIX =
  "backsteros-desktop.task-detail-side-panel-width.task.";

/**
 * Shared floor for both columns (task + agent Chat/Terminal), all project types.
 */
export const TASK_LAYOUT_COLUMN_MIN_WIDTH = 380;

export const TASK_DETAIL_SIDE_PANEL_MIN_WIDTH = TASK_LAYOUT_COLUMN_MIN_WIDTH;
/** Codebase start: narrow task column. */
export const TASK_DETAIL_SIDE_PANEL_NARROW_DEFAULT = TASK_LAYOUT_COLUMN_MIN_WIDTH;
/** Default/inbox start: narrow agent column (task gets the rest). */
export const TASK_DETAIL_AGENT_REMAINDER_TARGET = TASK_LAYOUT_COLUMN_MIN_WIDTH;
export const TASK_DETAIL_AGENT_PANEL_MIN_WIDTH = TASK_LAYOUT_COLUMN_MIN_WIDTH;
/** Collapsed agent / detail chrome strip width (matches CSS). */
export const TASK_DETAIL_AGENT_STRIP_WIDTH = 46;
/** Above this, TaskDetailView switches from chips to the properties card rail. */
export const TASK_DETAIL_PROPERTIES_RAIL_BREAKPOINT = 720;

export type TaskLayoutCollapseMode = "expanded" | "agent-collapsed" | "detail-collapsed";

/** Pixel column widths for the task | agent grid (both tracks must be px to animate). */
export function resolveTaskLayoutColumnWidths(options: {
  containerWidth: number;
  panelWidth: number;
  mode: TaskLayoutCollapseMode;
  stripWidth?: number;
}): { detail: number; agent: number } {
  const strip = options.stripWidth ?? TASK_DETAIL_AGENT_STRIP_WIDTH;
  const container = Math.max(0, Math.round(options.containerWidth));
  if (options.mode === "agent-collapsed") {
    return {
      detail: Math.max(0, container - strip),
      agent: strip,
    };
  }
  if (options.mode === "detail-collapsed") {
    return {
      detail: strip,
      agent: Math.max(0, container - strip),
    };
  }
  const detail = clampTaskDetailSidePanelWidth(options.panelWidth, container);
  return {
    detail,
    agent: Math.max(0, container - detail),
  };
}
/** Keyboard ⌥-/⌥= nudge size — large enough that hold-to-repeat stays ahead of the ease. */
export const TASK_DETAIL_SIDE_PANEL_NUDGE_STEP = 80;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** localStorage key for a task’s remembered panel width. */
export function taskDetailSidePanelWidthKey(taskId: string): string {
  return `${TASK_DETAIL_SIDE_PANEL_WIDTH_KEY_PREFIX}${taskId}`;
}

export function defaultTaskDetailSidePanelWidth(
  containerWidth: number,
  preferWide: boolean,
): number {
  if (!preferWide) return TASK_DETAIL_SIDE_PANEL_NARROW_DEFAULT;
  if (!(containerWidth > 0)) {
    return Math.max(
      TASK_DETAIL_SIDE_PANEL_NARROW_DEFAULT,
      TASK_DETAIL_PROPERTIES_RAIL_BREAKPOINT,
    );
  }
  return clampTaskDetailSidePanelWidth(
    containerWidth - TASK_DETAIL_AGENT_REMAINDER_TARGET,
    containerWidth,
  );
}

function readStoredWidth(storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(parsed)) return null;
    return Math.max(parsed, TASK_DETAIL_SIDE_PANEL_MIN_WIDTH);
  } catch {
    return null;
  }
}

export function readTaskDetailSidePanelWidth(
  taskId: string,
  preferWide: boolean,
): number {
  const stored = readStoredWidth(taskDetailSidePanelWidthKey(taskId));
  if (stored != null) return stored;
  return preferWide
    ? TASK_DETAIL_PROPERTIES_RAIL_BREAKPOINT
    : TASK_DETAIL_SIDE_PANEL_NARROW_DEFAULT;
}

export function writeTaskDetailSidePanelWidth(
  taskId: string,
  width: number,
): void {
  if (typeof window === "undefined" || !taskId) return;
  try {
    window.localStorage.setItem(
      taskDetailSidePanelWidthKey(taskId),
      String(Math.round(Math.max(width, TASK_DETAIL_SIDE_PANEL_MIN_WIDTH))),
    );
  } catch {
    /* ignore quota */
  }
}

/**
 * Clamp the task column so neither column goes below the shared 380px floor.
 */
export function clampTaskDetailSidePanelWidth(
  width: number,
  containerWidth: number,
): number {
  if (!(Number.isFinite(containerWidth) && containerWidth > 0)) {
    return Math.max(width, TASK_DETAIL_SIDE_PANEL_MIN_WIDTH);
  }
  const maxWidth = Math.max(
    TASK_DETAIL_SIDE_PANEL_MIN_WIDTH,
    containerWidth - TASK_DETAIL_AGENT_PANEL_MIN_WIDTH,
  );
  return clamp(width, TASK_DETAIL_SIDE_PANEL_MIN_WIDTH, maxWidth);
}

function resolvePanelWidth(
  taskId: string,
  preferWide: boolean,
  containerWidth: number,
): { width: number; hasStored: boolean } {
  const stored = taskId
    ? readStoredWidth(taskDetailSidePanelWidthKey(taskId))
    : null;
  if (stored != null) {
    return {
      width: clampTaskDetailSidePanelWidth(stored, containerWidth),
      hasStored: true,
    };
  }
  return {
    width: defaultTaskDetailSidePanelWidth(containerWidth, preferWide),
    hasStored: false,
  };
}

/**
 * Tracks and persists the left task-detail panel width with drag-to-resize.
 *
 * Remembers width per `taskId` after the user resizes. With no memory for that
 * task, falls back to the type default:
 * - preferWide false (codebase): task column 380px
 * - preferWide true (default/inbox): agent column 380px
 */
export function useTaskDetailSidePanelWidth(
  taskId: string,
  preferWide: boolean,
): {
  containerRef: (node: HTMLDivElement | null) => void;
  panelWidth: number;
  containerWidth: number;
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
    readTaskDetailSidePanelWidth(taskId, preferWide),
  );
  const [isResizing, setIsResizing] = useState(false);
  const panelWidthRef = useRef(panelWidth);
  const containerWidthRef = useRef(containerWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const taskIdRef = useRef(taskId);
  const preferWideRef = useRef(preferWide);
  const persistTimerRef = useRef<number | null>(null);
  const nudgerRef = useRef<PanelWidthNudger | null>(null);
  const hasStoredWidthRef = useRef(
    Boolean(taskId) &&
      readStoredWidth(taskDetailSidePanelWidthKey(taskId)) != null,
  );

  taskIdRef.current = taskId;
  preferWideRef.current = preferWide;
  containerWidthRef.current = containerWidth;

  const applyVisualWidth = useCallback((width: number) => {
    panelWidthRef.current = width;
    const container = containerElRef.current;
    if (!container) return;
    container.style.setProperty(
      "--desktop-task-side-panel-width",
      `${width}px`,
    );
    // Keep live grid tracks in sync while both columns are open (drag / ⌥ nudge).
    // Collapse/expand overwrites these from DesktopTaskLayout.
    if (
      !container.classList.contains("is-agent-collapsed") &&
      !container.classList.contains("is-detail-collapsed")
    ) {
      const containerWidth = container.clientWidth;
      const columns = resolveTaskLayoutColumnWidths({
        containerWidth,
        panelWidth: width,
        mode: "expanded",
      });
      container.style.setProperty(
        "--desktop-task-detail-col",
        `${columns.detail}px`,
      );
      container.style.setProperty(
        "--desktop-task-agent-col",
        `${columns.agent}px`,
      );
      container.style.gridTemplateColumns = `${columns.detail}px ${columns.agent}px`;
    }
  }, []);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerElRef.current = node;
    setContainerNode(node);
    if (!node) {
      setContainerWidth(0);
      return;
    }
    const containerWidth = Math.round(node.getBoundingClientRect().width);
    setContainerWidth(containerWidth);
    const columns = resolveTaskLayoutColumnWidths({
      containerWidth,
      panelWidth: panelWidthRef.current,
      mode: "expanded",
    });
    node.style.setProperty(
      "--desktop-task-side-panel-width",
      `${columns.detail}px`,
    );
    node.style.setProperty("--desktop-task-detail-col", `${columns.detail}px`);
    node.style.setProperty("--desktop-task-agent-col", `${columns.agent}px`);
    node.style.gridTemplateColumns = `${columns.detail}px ${columns.agent}px`;
  }, []);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  const persistPanelWidth = useCallback((width: number, immediate = false) => {
    hasStoredWidthRef.current = true;
    const taskIdNow = taskIdRef.current;
    const rounded = Math.round(width);
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (immediate) {
      writeTaskDetailSidePanelWidth(taskIdNow, rounded);
      return;
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      writeTaskDetailSidePanelWidth(taskIdNow, rounded);
    }, 180);
  }, []);

  useEffect(() => {
    const nudger = createPanelWidthNudger({
      getWidth: () => panelWidthRef.current,
      setWidth: (width) => {
        applyVisualWidth(width);
      },
      clampWidth: (width) =>
        clampTaskDetailSidePanelWidth(
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

  // Apply per-task memory or type default when task / mode / size changes.
  useEffect(() => {
    const { width, hasStored } = resolvePanelWidth(
      taskId,
      preferWide,
      containerWidth,
    );
    hasStoredWidthRef.current = hasStored;
    applyVisualWidth(width);
    setPanelWidthState(width);
    nudgerRef.current?.sync(width);
  }, [taskId, preferWide, containerWidth, applyVisualWidth]);

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
        const next = clampTaskDetailSidePanelWidth(
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
    containerWidth,
    beginResize,
    nudgePanelWidth,
    isResizing,
  };
}
