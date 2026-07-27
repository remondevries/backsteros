import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "backsteros-desktop.agent-diff-panel-width";
export const AGENT_DIFF_PANEL_WIDE_BREAKPOINT = 720;
export const AGENT_DIFF_PANEL_MIN_WIDTH = 280;
export const AGENT_DIFF_PANEL_DEFAULT_WIDTH = 420;

export type AgentDiffPanelLayoutMode = "docked" | "sheet";

export function readAgentDiffPanelWidth(): number {
  if (typeof window === "undefined") return AGENT_DIFF_PANEL_DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed)) return AGENT_DIFF_PANEL_DEFAULT_WIDTH;
    return Math.max(AGENT_DIFF_PANEL_MIN_WIDTH, parsed);
  } catch {
    return AGENT_DIFF_PANEL_DEFAULT_WIDTH;
  }
}

export function writeAgentDiffPanelWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      String(Math.round(Math.max(AGENT_DIFF_PANEL_MIN_WIDTH, width))),
    );
  } catch {
    /* ignore quota */
  }
}

export function clampAgentDiffPanelWidth(
  width: number,
  bodyWidth: number,
): number {
  if (!Number.isFinite(bodyWidth) || bodyWidth <= 0) {
    return Math.max(AGENT_DIFF_PANEL_MIN_WIDTH, width);
  }
  const maxWidth = Math.max(
    AGENT_DIFF_PANEL_MIN_WIDTH,
    Math.floor(bodyWidth * 0.7),
  );
  return Math.min(maxWidth, Math.max(AGENT_DIFF_PANEL_MIN_WIDTH, width));
}

/**
 * Tracks agent-body width to choose docked vs sheet Diff layout, and persists
 * the docked column width.
 */
export function useAgentDiffPanelLayout(open: boolean): {
  bodyRef: (node: HTMLDivElement | null) => void;
  layoutMode: AgentDiffPanelLayoutMode;
  panelWidth: number;
  setPanelWidth: (width: number) => void;
  beginResize: (clientX: number) => void;
} {
  const bodyElRef = useRef<HTMLDivElement | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [panelWidth, setPanelWidthState] = useState(() =>
    readAgentDiffPanelWidth(),
  );
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const bodyRef = useCallback((node: HTMLDivElement | null) => {
    bodyElRef.current = node;
    if (!node) {
      setBodyWidth(0);
      return;
    }
    setBodyWidth(Math.round(node.getBoundingClientRect().width));
  }, []);

  useEffect(() => {
    const node = bodyElRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const update = () => {
      setBodyWidth(Math.round(node.getBoundingClientRect().width));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  const setPanelWidth = useCallback(
    (width: number) => {
      const next = clampAgentDiffPanelWidth(width, bodyWidth);
      setPanelWidthState(next);
      writeAgentDiffPanelWidth(next);
    },
    [bodyWidth],
  );

  useEffect(() => {
    if (!open || bodyWidth <= 0) return;
    setPanelWidthState((prev) => clampAgentDiffPanelWidth(prev, bodyWidth));
  }, [bodyWidth, open]);

  const beginResize = useCallback(
    (clientX: number) => {
      dragRef.current = { startX: clientX, startWidth: panelWidth };
      const onMove = (event: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        // Dragging the left edge: moving left grows the panel.
        const delta = drag.startX - event.clientX;
        setPanelWidth(drag.startWidth + delta);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [panelWidth, setPanelWidth],
  );

  const layoutMode: AgentDiffPanelLayoutMode =
    bodyWidth > 0 && bodyWidth < AGENT_DIFF_PANEL_WIDE_BREAKPOINT
      ? "sheet"
      : "docked";

  return {
    bodyRef,
    layoutMode,
    panelWidth,
    setPanelWidth,
    beginResize,
  };
}
