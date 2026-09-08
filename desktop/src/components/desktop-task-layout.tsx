import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  ContentLayoutTransitionProvider,
  shouldHandleGlobalShortcut,
} from "@backsteros/ui";

import { DesktopTaskChangesCollapsedStrip } from "./desktop-task-changes-collapsed-strip";
import type { DesktopTaskChangesSurface } from "./desktop-task-changes-collapsed-strip";
import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
import {
  resolveTaskLayoutColumnWidths,
  TASK_DETAIL_SIDE_PANEL_NUDGE_STEP,
  useTaskDetailSidePanelWidth,
  type TaskLayoutCollapseMode,
} from "../lib/task-detail-side-panel-layout";
import { resolveTaskPanelResizeShortcut } from "../lib/task-panel-resize-shortcut";

const LAYOUT_COLLAPSE_DURATION_MS = 220;

export type DesktopTaskSidePanelControls = {
  /** Collapse the Changes / side column to the icon strip. */
  hide: () => void;
};

export type { DesktopTaskChangesSurface };

export type DesktopTaskLayoutProps = {
  children: ReactNode;
  /**
   * Optional right rail (replaces the old Agent Chat column) — e.g. linked
   * commit Changes / diff for codebase tasks.
   * Pass a render function to receive hide controls for the panel toggle icon.
   */
  sidePanel?:
    | ReactNode
    | ((controls: DesktopTaskSidePanelControls) => ReactNode)
    | null;
  /** Required when `sidePanel` is set — remembers column width per task. */
  taskId?: string;
  /**
   * When false (codebase), start with a narrow task column so the side panel
   * gets the remainder — same split Agent Chat used.
   */
  preferWideTaskPanel?: boolean;
  /** Collapsed strip tabs (one per linked commit); empty → dashed ghost. */
  sidePanelSurfaces?: DesktopTaskChangesSurface[];
  sidePanelActiveSurfaceId?: string | null;
  onActivateSidePanelSurface?: (id: string) => void;
  /** Expand + open the link-commit picker (collapsed + / empty ghost). */
  onAddSidePanelSurface?: () => void;
  /** When false, hide the collapsed + affordance (at link cap). */
  sidePanelCanAddSurface?: boolean;
};

/**
 * Task detail host. Optional right rail hosts linked-commit Changes / diff
 * (former Agent Chat slot). Coding agents live in Grok / BacksterDEV instead.
 *
 * ] toggles the Changes column (same shortcut the agent panel used).
 * ⌥- / ⌥= nudge the split when both columns are open.
 */
export function DesktopTaskLayout({
  children,
  sidePanel = null,
  taskId = "",
  preferWideTaskPanel = true,
  sidePanelSurfaces = [],
  sidePanelActiveSurfaceId = null,
  onActivateSidePanelSurface,
  onAddSidePanelSurface,
  sidePanelCanAddSurface = true,
}: DesktopTaskLayoutProps) {
  const hasSidePanel = sidePanel != null;
  const layoutElRef = useRef<HTMLDivElement | null>(null);
  const [sideCollapsed, setSideCollapsed] = useState(
    () => sidePanel != null && sidePanelSurfaces.length === 0,
  );
  const [collapseAnimating, setCollapseAnimating] = useState(false);
  const collapseAnimTimerRef = useRef<number | null>(null);
  const collapseRafRef = useRef<number | null>(null);
  const previousTaskIdRef = useRef<string | null>(null);
  const previousSurfaceCountRef = useRef(sidePanelSurfaces.length);

  const {
    containerRef,
    panelWidth: detailPanelWidth,
    containerWidth,
    beginResize,
    nudgePanelWidth,
    isResizing,
  } = useTaskDetailSidePanelWidth(
    hasSidePanel ? taskId : "",
    preferWideTaskPanel,
  );

  const setLayoutRef = useCallback(
    (node: HTMLDivElement | null) => {
      layoutElRef.current = node;
      containerRef(node);
    },
    [containerRef],
  );

  const applyColumnWidths = useCallback(
    (mode: TaskLayoutCollapseMode, panelWidth: number) => {
      const el = layoutElRef.current;
      if (!el) return;
      const columns = resolveTaskLayoutColumnWidths({
        containerWidth: el.clientWidth,
        panelWidth,
        mode,
      });
      el.style.setProperty("--desktop-task-detail-col", `${columns.detail}px`);
      el.style.setProperty("--desktop-task-agent-col", `${columns.agent}px`);
      el.style.gridTemplateColumns = `${columns.detail}px ${columns.agent}px`;
    },
    [],
  );

  const collapseMode: TaskLayoutCollapseMode = sideCollapsed
    ? "agent-collapsed"
    : "expanded";

  useLayoutEffect(() => {
    if (!hasSidePanel) return;
    applyColumnWidths(collapseMode, detailPanelWidth);
  }, [
    applyColumnWidths,
    collapseMode,
    containerWidth,
    detailPanelWidth,
    hasSidePanel,
  ]);

  const beginCollapseAnimation = useCallback((apply: () => void) => {
    setCollapseAnimating(true);
    if (collapseAnimTimerRef.current != null) {
      window.clearTimeout(collapseAnimTimerRef.current);
      collapseAnimTimerRef.current = null;
    }
    if (collapseRafRef.current != null) {
      window.cancelAnimationFrame(collapseRafRef.current);
      collapseRafRef.current = null;
    }
    collapseRafRef.current = window.requestAnimationFrame(() => {
      collapseRafRef.current = window.requestAnimationFrame(() => {
        collapseRafRef.current = null;
        apply();
        collapseAnimTimerRef.current = window.setTimeout(() => {
          collapseAnimTimerRef.current = null;
          setCollapseAnimating(false);
        }, LAYOUT_COLLAPSE_DURATION_MS);
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (collapseAnimTimerRef.current != null) {
        window.clearTimeout(collapseAnimTimerRef.current);
      }
      if (collapseRafRef.current != null) {
        window.cancelAnimationFrame(collapseRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasSidePanel) return;
    if (previousTaskIdRef.current === taskId) return;
    previousTaskIdRef.current = taskId;
    previousSurfaceCountRef.current = sidePanelSurfaces.length;
    // Empty Changes rail: start collapsed so the task body gets the width.
    setSideCollapsed(sidePanelSurfaces.length === 0);
  }, [hasSidePanel, sidePanelSurfaces.length, taskId]);

  useEffect(() => {
    if (!hasSidePanel) return;
    const nextCount = sidePanelSurfaces.length;
    const previousCount = previousSurfaceCountRef.current;
    if (previousCount === nextCount) return;
    previousSurfaceCountRef.current = nextCount;
    if (nextCount === 0) {
      beginCollapseAnimation(() => setSideCollapsed(true));
      return;
    }
    if (previousCount === 0 && nextCount > 0) {
      beginCollapseAnimation(() => setSideCollapsed(false));
    }
  }, [beginCollapseAnimation, hasSidePanel, sidePanelSurfaces.length]);

  const hideSidePanel = useCallback(() => {
    beginCollapseAnimation(() => setSideCollapsed(true));
  }, [beginCollapseAnimation]);

  const showSidePanel = useCallback(() => {
    beginCollapseAnimation(() => setSideCollapsed(false));
  }, [beginCollapseAnimation]);

  const toggleSidePanel = useCallback(() => {
    beginCollapseAnimation(() => setSideCollapsed((current) => !current));
  }, [beginCollapseAnimation]);

  useEffect(() => {
    if (!hasSidePanel) return;

    function handleKeyDown(event: KeyboardEvent) {
      const resizeDirection = resolveTaskPanelResizeShortcut(event);
      if (resizeDirection) {
        if (!shouldHandleGlobalShortcut(event)) return;
        if (sideCollapsed) return;
        event.preventDefault();
        event.stopPropagation();
        const delta =
          resizeDirection === "shrink-left"
            ? -TASK_DETAIL_SIDE_PANEL_NUDGE_STEP
            : TASK_DETAIL_SIDE_PANEL_NUDGE_STEP;
        nudgePanelWidth(delta);
        return;
      }

      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleSidePanel();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [hasSidePanel, nudgePanelWidth, sideCollapsed, toggleSidePanel]);

  if (!hasSidePanel) {
    return (
      <div
        className="desktop-task-layout desktop-task-layout--detail-only"
        data-content-detail
        data-agent-panel="off"
      >
        <div className="desktop-task-layout__detail">
          <div className="desktop-task-layout__detail-body">{children}</div>
        </div>
      </div>
    );
  }

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    beginResize(event.clientX);
  };

  const sidePanelNode =
    typeof sidePanel === "function"
      ? sidePanel({ hide: hideSidePanel })
      : sidePanel;

  return (
    <ContentLayoutTransitionProvider animating={collapseAnimating}>
      <div
        ref={setLayoutRef}
        className={[
          "desktop-task-layout",
          "desktop-task-layout--with-side",
          sideCollapsed ? "is-agent-collapsed" : null,
          collapseAnimating ? "is-collapse-animating" : null,
          isResizing ? "is-resizing" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-content-detail
        data-agent-panel="diff"
        data-agent-collapsed={sideCollapsed ? "true" : "false"}
      >
        <div className="desktop-task-layout__detail">
          {!sideCollapsed ? (
            <div
              className="desktop-task-layout-side-panel-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize task and changes panels"
              title="Drag to resize · ⌥- / ⌥="
              onPointerDown={onResizePointerDown}
            />
          ) : null}
          <div className="desktop-task-layout__detail-body">{children}</div>
        </div>
        <aside
          className={[
            "desktop-task-layout__terminal",
            "desktop-task-layout__side",
            sideCollapsed ? "is-collapsed" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Task changes"
        >
          {sideCollapsed ? (
            <DesktopTaskChangesCollapsedStrip
              surfaces={sidePanelSurfaces}
              activeId={sidePanelActiveSurfaceId}
              canAddSurface={sidePanelCanAddSurface}
              onExpand={showSidePanel}
              onActivateSurface={onActivateSidePanelSurface}
              onAddSurface={onAddSidePanelSurface}
            />
          ) : null}
          <div
            className="desktop-task-layout__side-body"
            hidden={sideCollapsed}
            aria-hidden={sideCollapsed || undefined}
          >
            {sidePanelNode}
          </div>
        </aside>
      </div>
    </ContentLayoutTransitionProvider>
  );
}
