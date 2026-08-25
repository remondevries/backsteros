import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  migrateLegacyTaskStatus,
  ProjectsSidePanelIcon,
  TaskStatusIcon,
  TerminalDirectoryGate,
  shouldHandleGlobalShortcut,
} from "@backsteros/ui";

import { DesktopAgentChatPanel } from "./desktop-agent-chat-panel";
import type { AgentChatViewScope } from "../lib/agent/agent-chat-transcript";
import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
import { isTaskAgentWorkingForUi } from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatus } from "../lib/agent/agent-status-context";
import { normalizeWorkingDirectory } from "../lib/agent/project-workspace";
import {
  useDesktopTaskAgentSession,
  type DesktopTaskAgentSessionSummary,
} from "../lib/agent/use-desktop-task-agent-session";
import {
  TASK_DETAIL_SIDE_PANEL_MIN_WIDTH,
  TASK_DETAIL_SIDE_PANEL_NUDGE_STEP,
  resolveTaskLayoutColumnWidths,
  useTaskDetailSidePanelWidth,
  type TaskLayoutCollapseMode,
} from "../lib/task-detail-side-panel-layout";
import { resolveTaskPanelResizeShortcut } from "../lib/task-panel-resize-shortcut";
import { projectFs } from "../lib/project-fs";

const LAYOUT_READY_DELAY_MS = 220;

function collapseModeFor(
  detailCollapsed: boolean,
  agentCollapsed: boolean,
): TaskLayoutCollapseMode {
  if (agentCollapsed) return "agent-collapsed";
  if (detailCollapsed) return "detail-collapsed";
  return "expanded";
}

/** ⇧[ collapses/expands the task detail column so chat can grow. */
function isTaskDetailPanelToggleShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return event.shiftKey && event.code === "BracketLeft";
}

export type DesktopTaskLayoutProps = {
  children: ReactNode;
  taskId: string;
  projectId: string | null;
  projectLabel?: string;
  taskDisplayId?: string | null;
  cwd?: string | null;
  /** Cursor chat id from core (`task.agentChatId`). */
  agentChatId?: string | null;
  /** Task status — suppresses Working… when On Hold. */
  taskStatus?: string | null;
  taskSummary: DesktopTaskAgentSessionSummary;
  patchTaskValues: (values: Record<string, unknown>) => Promise<void>;
  /**
   * When set, show TerminalDirectoryGate until a real working directory exists.
   * Omit for non-codebase tasks (agent uses `cwd` / `~` without a gate).
   */
  onWorkingDirectoryChange?: (directory: string) => void | Promise<void>;
  /** Codebase only: auto-start agent when status enters Ready to Start. */
  autoStartOnReadyToStart?: boolean;
  /**
   * Prefer a wide task panel when no width is stored yet (default/inbox).
   * Codebase tasks pass false for the narrow ~380px default.
   */
  preferWideTaskPanel?: boolean;
  /** Chat/Terminal tab persistence scope. */
  viewScope?: AgentChatViewScope;
  /** Require a real working directory before mounting the agent pane. */
  requireWorkingDirectory?: boolean;
  /**
   * When false, ⇧[ is left for the shell content list panel (e.g. Inbox).
   * Task routes without a list panel keep the default (toggle detail column).
   */
  detailColumnToggleShortcutEnabled?: boolean;
};

/**
 * Shared task layout: detail left (resizable), agent surface right.
 *
 * ⇧[ toggles the left task-detail column so the chat pane can go wider
 * (unless {@link detailColumnToggleShortcutEnabled} is false).
 * ] toggles the agent content panel so task details can grow.
 * ⌥- / ⌥= nudge the split (shrink left / shrink right) with a smooth grid transition.
 *
 * Auto-start on Ready to Start is opt-in (`autoStartOnReadyToStart`) and
 * should only be enabled for codebase projects.
 */
export function DesktopTaskLayout({
  children,
  taskId,
  projectId,
  projectLabel = "Task",
  taskDisplayId = null,
  cwd = null,
  agentChatId = null,
  taskStatus = null,
  taskSummary,
  patchTaskValues,
  onWorkingDirectoryChange,
  autoStartOnReadyToStart = false,
  preferWideTaskPanel = true,
  viewScope = "rail",
  requireWorkingDirectory = false,
  detailColumnToggleShortcutEnabled = true,
}: DesktopTaskLayoutProps) {
  const workingDirectory = requireWorkingDirectory
    ? normalizeWorkingDirectory(cwd)
    : cwd?.trim() || "~";
  const hasWorkingDirectory = requireWorkingDirectory
    ? Boolean(normalizeWorkingDirectory(cwd))
    : true;

  const {
    focusRequest,
    agentAttachRequest,
    clearAttachRequest,
    agentEndRequest,
    clearEndRequest,
    setSummary,
    setStatusItems,
    setWorkingTaskIds,
    setOpenTaskIds,
    requestAttach,
    isTaskWorking,
  } = useDesktopAgentStatus();

  const detailStripWorking = isTaskAgentWorkingForUi(
    { id: taskId, status: taskStatus },
    { isTaskWorking },
  );

  const {
    creatingAgent,
    agentError,
    startAgentSession: startAgentSessionBase,
    endAgentSession,
  } = useDesktopTaskAgentSession({
    taskId,
    agentChatId,
    taskSummary,
    patchTaskValues,
    automateTaskStatus: autoStartOnReadyToStart,
  });

  const [layoutReady, setLayoutReady] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [agentCollapsed, setAgentCollapsed] = useState(false);
  const [collapseAnimating, setCollapseAnimating] = useState(false);
  const collapseAnimTimerRef = useRef<number | null>(null);
  const collapseRafRef = useRef<number | null>(null);
  const layoutElRef = useRef<HTMLDivElement | null>(null);
  const previousTaskIdRef = useRef<string | null>(null);
  /** Tracks last observed status so Ready to Start auto-start is a transition. */
  const previousStatusRef = useRef<string | null>(null);
  /** At most one Ready-to-Start auto-start per task visit (status can flap). */
  const autoStartedTaskIdRef = useRef<string | null>(null);
  /** One viewer-reconcile attach per task/chat visit. */
  const reconcileKeyRef = useRef<string | null>(null);
  const {
    containerRef,
    panelWidth: detailPanelWidth,
    containerWidth,
    beginResize: beginDetailResize,
    nudgePanelWidth: nudgeDetailPanelWidth,
    isResizing: isDetailResizing,
  } = useTaskDetailSidePanelWidth(taskId, preferWideTaskPanel);

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
      // Inline tracks so grid-template-columns transitions interpolate px↔px.
      el.style.gridTemplateColumns = `${columns.detail}px ${columns.agent}px`;
    },
    [],
  );

  useLayoutEffect(() => {
    applyColumnWidths(
      collapseModeFor(detailCollapsed, agentCollapsed),
      detailPanelWidth,
    );
  }, [
    agentCollapsed,
    applyColumnWidths,
    containerWidth,
    detailCollapsed,
    detailPanelWidth,
  ]);

  const beginCollapseAnimation = useCallback(
    (apply: () => void) => {
      setCollapseAnimating(true);
      if (collapseAnimTimerRef.current != null) {
        window.clearTimeout(collapseAnimTimerRef.current);
        collapseAnimTimerRef.current = null;
      }
      if (collapseRafRef.current != null) {
        window.cancelAnimationFrame(collapseRafRef.current);
        collapseRafRef.current = null;
      }
      // Enable transition for one paint, then change column widths so the
      // browser interpolates from the previous px tracks (avoids flex flicker).
      collapseRafRef.current = window.requestAnimationFrame(() => {
        collapseRafRef.current = window.requestAnimationFrame(() => {
          collapseRafRef.current = null;
          apply();
          collapseAnimTimerRef.current = window.setTimeout(() => {
            collapseAnimTimerRef.current = null;
            setCollapseAnimating(false);
          }, LAYOUT_READY_DELAY_MS);
        });
      });
    },
    [],
  );

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

  const startAgentSession = useCallback(
    (options?: Parameters<typeof startAgentSessionBase>[0]) => {
      beginCollapseAnimation(() => {
        setAgentCollapsed(false);
        setDetailCollapsed(false);
      });
      return startAgentSessionBase(options);
    },
    [beginCollapseAnimation, startAgentSessionBase],
  );

  const toggleDetailCollapsed = useCallback(() => {
    beginCollapseAnimation(() => {
      setDetailCollapsed((current) => {
        const next = !current;
        if (next) setAgentCollapsed(false);
        return next;
      });
    });
  }, [beginCollapseAnimation]);

  const toggleAgentCollapsed = useCallback(() => {
    beginCollapseAnimation(() => {
      setAgentCollapsed((current) => {
        const next = !current;
        if (next) setDetailCollapsed(false);
        return next;
      });
    });
  }, [beginCollapseAnimation]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTaskDetailPanelToggleShortcut(event)) {
        // Inbox keeps ⇧[ for the list side panel; don't steal it here.
        if (!detailColumnToggleShortcutEnabled) return;
        if (!shouldHandleGlobalShortcut(event)) return;
        event.preventDefault();
        event.stopPropagation();
        toggleDetailCollapsed();
        return;
      }

      const resizeDirection = resolveTaskPanelResizeShortcut(event);
      if (resizeDirection) {
        if (!shouldHandleGlobalShortcut(event)) return;
        // Only when both columns are visible — same as the drag handle.
        if (detailCollapsed || agentCollapsed) return;
        event.preventDefault();
        event.stopPropagation();
        const delta =
          resizeDirection === "shrink-left"
            ? -TASK_DETAIL_SIDE_PANEL_NUDGE_STEP
            : TASK_DETAIL_SIDE_PANEL_NUDGE_STEP;
        nudgeDetailPanelWidth(delta);
        return;
      }

      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleAgentCollapsed();
    }

    // Capture so we win over the global content-side-panel ⇧[ handler when
    // this layout owns the shortcut (task routes without a list panel).
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    agentCollapsed,
    detailCollapsed,
    detailColumnToggleShortcutEnabled,
    nudgeDetailPanelWidth,
    toggleAgentCollapsed,
    toggleDetailCollapsed,
  ]);

  useEffect(() => {
    if (!hasWorkingDirectory || agentCollapsed) {
      setLayoutReady(false);
      return;
    }
    setLayoutReady(false);
    const timer = window.setTimeout(
      () => setLayoutReady(true),
      LAYOUT_READY_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [agentCollapsed, hasWorkingDirectory, taskId]);

  useEffect(() => {
    const taskChanged = previousTaskIdRef.current !== taskId;
    previousTaskIdRef.current = taskId;
    if (taskChanged) {
      reconcileKeyRef.current = null;
      previousStatusRef.current = null;
      autoStartedTaskIdRef.current = null;
      setDetailCollapsed(false);
      setAgentCollapsed(false);
    }
  }, [taskId]);

  // Codebase only: pick up work when the task enters Ready to Start.
  useEffect(() => {
    if (!autoStartOnReadyToStart) return;
    const status = migrateLegacyTaskStatus(taskStatus ?? "backlog");

    // Wait until the agent pane can actually start (cwd + layout).
    if (!layoutReady || !hasWorkingDirectory) return;

    const previous = previousStatusRef.current;
    const canAutoStart =
      status === "ready_to_start" &&
      !agentChatId?.trim() &&
      !creatingAgent &&
      autoStartedTaskIdRef.current !== taskId;

    if (previous === null) {
      previousStatusRef.current = status;
      // Opened an unbound Ready to Start task — pick it up immediately.
      if (canAutoStart) {
        autoStartedTaskIdRef.current = taskId;
        void startAgentSession();
      }
      return;
    }

    previousStatusRef.current = status;
    if (!canAutoStart) return;
    // Only on transition into Ready to Start (continuous agent loop).
    if (previous === "ready_to_start") return;

    autoStartedTaskIdRef.current = taskId;
    void startAgentSession();
  }, [
    agentChatId,
    autoStartOnReadyToStart,
    creatingAgent,
    hasWorkingDirectory,
    layoutReady,
    startAgentSession,
    taskId,
    taskStatus,
  ]);

  // Return to a bound task: re-subscribe the ACP chat event bridge.
  // Do not focus the composer — Tab is the only keyboard entry into the box.
  useEffect(() => {
    if (!layoutReady || !hasWorkingDirectory) return;
    const chatId = agentChatId?.trim();
    if (!chatId) {
      reconcileKeyRef.current = null;
      return;
    }
    const key = `${taskId}:${chatId.toLowerCase()}`;
    if (reconcileKeyRef.current === key) return;
    reconcileKeyRef.current = key;
    requestAttach({
      taskId,
      chatId,
      forceReattach: true,
      focusUi: false,
    });
  }, [agentChatId, hasWorkingDirectory, layoutReady, requestAttach, taskId]);

  return (
    <div
      ref={setLayoutRef}
      className={[
        "desktop-task-layout",
        detailCollapsed ? "is-detail-collapsed" : null,
        agentCollapsed ? "is-agent-collapsed" : null,
        collapseAnimating ? "is-collapse-animating" : null,
        isDetailResizing ? "is-resizing" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-detail
      data-detail-collapsed={detailCollapsed ? "true" : "false"}
      data-agent-collapsed={agentCollapsed ? "true" : "false"}
    >
      <div
        className={[
          "desktop-task-layout__detail",
          detailCollapsed ? "is-collapsed" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {detailCollapsed ? (
          <button
            type="button"
            className="desktop-task-layout__detail-strip"
            title="Show details (⇧[)"
            aria-label="Show details"
            onClick={() => {
              beginCollapseAnimation(() => setDetailCollapsed(false));
            }}
          >
            <TaskStatusIcon
              status={taskStatus ?? "backlog"}
              working={detailStripWorking}
              size={14}
              className="desktop-task-layout__detail-strip-status"
            />
            <span className="desktop-task-layout__detail-strip-label">
              Details
            </span>
          </button>
        ) : null}
        <div
          className="desktop-task-layout__detail-body"
          hidden={detailCollapsed}
          aria-hidden={detailCollapsed || undefined}
        >
          {children}
        </div>
        {!detailCollapsed && !agentCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize task panel"
            aria-valuemin={TASK_DETAIL_SIDE_PANEL_MIN_WIDTH}
            aria-valuenow={detailPanelWidth}
            title="Drag to resize · ⌥- / ⌥="
            className="desktop-task-layout-side-panel-resize"
            onPointerDown={(event) => {
              event.preventDefault();
              beginDetailResize(event.clientX);
            }}
          />
        ) : null}
      </div>
      <aside
        className={[
          "desktop-task-layout__terminal",
          agentCollapsed ? "is-collapsed" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Task agent"
      >
        {hasWorkingDirectory ? (
          <div className="desktop-task-layout__terminal-body">
            <DesktopAgentChatPanel
              key={taskId}
              taskId={taskId}
              projectId={projectId}
              projectLabel={projectLabel}
              taskDisplayId={taskDisplayId}
              cwd={workingDirectory}
              agentChatId={agentChatId}
              taskStatus={taskStatus}
              collapsed={agentCollapsed}
              layoutReady={layoutReady}
              viewScope={viewScope}
              agentAttachRequest={agentAttachRequest}
              onAgentAttachRequestHandled={clearAttachRequest}
              agentEndRequest={agentEndRequest}
              onAgentEndRequestHandled={clearEndRequest}
              onAgentActivitySummaryChange={setSummary}
              onWorkingTaskIdsChange={setWorkingTaskIds}
              onAgentStatusItemsChange={setStatusItems}
              onAgentOpenTaskIdsChange={setOpenTaskIds}
              focusRequest={focusRequest}
              onHide={() => {
                beginCollapseAnimation(() => {
                  setAgentCollapsed(true);
                  setDetailCollapsed(false);
                });
              }}
              onExpand={() => {
                beginCollapseAnimation(() => setAgentCollapsed(false));
              }}
              onStartAgent={(options) => void startAgentSession(options)}
              startingAgent={creatingAgent}
              onStopAgent={endAgentSession}
              agentError={agentError}
              patchTaskValues={patchTaskValues}
            />
          </div>
        ) : agentCollapsed ? (
          <button
            type="button"
            className="desktop-terminal-strip"
            title="Show agent panel (])"
            aria-label="Show agent panel"
            onClick={() => {
              beginCollapseAnimation(() => setAgentCollapsed(false));
            }}
          >
            <ProjectsSidePanelIcon size={16} collapsed rail="end" />
          </button>
        ) : onWorkingDirectoryChange ? (
          <TerminalDirectoryGate
            fs={projectFs}
            showHeader={false}
            message="The terminal is unavailable until a working directory is defined for this project."
            onSelectDirectory={onWorkingDirectoryChange}
          />
        ) : null}
      </aside>
    </div>
  );
}
