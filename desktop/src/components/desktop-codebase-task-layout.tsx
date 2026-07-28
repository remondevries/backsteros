import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  migrateLegacyTaskStatus,
  TerminalDirectoryGate,
  shouldHandleGlobalShortcut,
} from "@backsteros/ui";

import { DesktopAgentChatPanel } from "./desktop-agent-chat-panel";
import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
import { useDesktopAgentStatus } from "../lib/agent/agent-status-context";
import { normalizeWorkingDirectory } from "../lib/agent/project-workspace";
import {
  useDesktopTaskAgentSession,
  type DesktopTaskAgentSessionSummary,
} from "../lib/agent/use-desktop-task-agent-session";
import {
  CODEBASE_SIDE_PANEL_MAX_WIDTH,
  CODEBASE_SIDE_PANEL_MIN_WIDTH,
  useCodebaseSidePanelWidth,
} from "../lib/codebase-side-panel-layout";
import { projectFs } from "../lib/project-fs";

const LAYOUT_READY_DELAY_MS = 220;
const DETAIL_COLLAPSED_WIDTH_PX = 46;
const AGENT_COLLAPSED_WIDTH_PX = 46;

/** ⇧[ collapses/expands the task detail column so chat can grow. */
function isCodebaseDetailPanelToggleShortcut(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return event.shiftKey && event.code === "BracketLeft";
}

export type DesktopCodebaseTaskLayoutProps = {
  children: ReactNode;
  taskId: string;
  projectId: string;
  projectLabel?: string;
  taskDisplayId?: string | null;
  cwd?: string | null;
  /** Cursor chat id from core (`task.agentChatId`). */
  agentChatId?: string | null;
  /** Task status — suppresses Working… when On Hold. */
  taskStatus?: string | null;
  taskSummary: DesktopTaskAgentSessionSummary;
  patchTaskValues: (values: Record<string, unknown>) => Promise<void>;
  onWorkingDirectoryChange: (directory: string) => void | Promise<void>;
};

/**
 * Codebase task layout: detail left, agent surface right (Chat / Terminal tabs).
 *
 * The agent runs in a sidecar PTY and is never stopped by navigation. Leaving
 * only tears down the disposable viewer; returning reconnects to the same
 * session (resume only if the agent is no longer live in that PTY).
 *
 * ⇧[ toggles the left task-detail column so the chat pane can go wider.
 * ] toggles the agent content panel so task details can grow (like the
 * default-project workbench rail), keeping stacked codebase properties.
 */
export function DesktopCodebaseTaskLayout({
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
}: DesktopCodebaseTaskLayoutProps) {
  const workingDirectory = normalizeWorkingDirectory(cwd);
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
  } = useDesktopAgentStatus();

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
    automateTaskStatus: true,
  });

  const [layoutReady, setLayoutReady] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [agentCollapsed, setAgentCollapsed] = useState(false);
  const [skipGridTransition, setSkipGridTransition] = useState(false);
  const previousTaskIdRef = useRef<string | null>(null);
  /** Tracks last observed status so Ready to Start auto-start is a transition. */
  const previousStatusRef = useRef<string | null>(null);
  /** One viewer-reconcile attach per task/chat visit. */
  const reconcileKeyRef = useRef<string | null>(null);
  const {
    containerRef,
    panelWidth: detailPanelWidth,
    beginResize: beginDetailResize,
    isResizing: isDetailResizing,
  } = useCodebaseSidePanelWidth();

  const startAgentSession = useCallback(
    (options?: Parameters<typeof startAgentSessionBase>[0]) => {
      setSkipGridTransition(true);
      setAgentCollapsed(false);
      setDetailCollapsed(false);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setSkipGridTransition(false));
      });
      return startAgentSessionBase(options);
    },
    [startAgentSessionBase],
  );

  const toggleDetailCollapsed = useCallback(() => {
    setDetailCollapsed((current) => {
      const next = !current;
      if (next) setAgentCollapsed(false);
      return next;
    });
  }, []);

  const toggleAgentCollapsed = useCallback(() => {
    // Snap the grid (skip column transition) so LegendList never measures the
    // strip width mid-animation and sticks messages at ~30px after reopen.
    setSkipGridTransition(true);
    setAgentCollapsed((current) => {
      const next = !current;
      if (next) setDetailCollapsed(false);
      return next;
    });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setSkipGridTransition(false));
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isCodebaseDetailPanelToggleShortcut(event)) {
        if (!shouldHandleGlobalShortcut(event)) return;
        event.preventDefault();
        event.stopPropagation();
        toggleDetailCollapsed();
        return;
      }
      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleAgentCollapsed();
    }

    // Capture so we win over the global content-side-panel ⇧[ handler.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [toggleAgentCollapsed, toggleDetailCollapsed]);

  useEffect(() => {
    if (!workingDirectory || agentCollapsed) {
      setLayoutReady(false);
      return;
    }
    setLayoutReady(false);
    const timer = window.setTimeout(
      () => setLayoutReady(true),
      LAYOUT_READY_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [agentCollapsed, taskId, workingDirectory]);

  useEffect(() => {
    const taskChanged = previousTaskIdRef.current !== taskId;
    previousTaskIdRef.current = taskId;
    if (taskChanged) {
      reconcileKeyRef.current = null;
      previousStatusRef.current = null;
      setDetailCollapsed(false);
      setAgentCollapsed(false);
    }
  }, [taskId]);

  // Codebase only: pick up work when the task enters Ready to Start.
  useEffect(() => {
    const status = migrateLegacyTaskStatus(taskStatus ?? "backlog");

    // Wait until the agent pane can actually start (cwd + layout).
    if (!layoutReady || !workingDirectory) return;

    const previous = previousStatusRef.current;
    if (previous === null) {
      previousStatusRef.current = status;
      // Opened an unbound Ready to Start task — pick it up immediately.
      if (
        status === "ready_to_start" &&
        !agentChatId?.trim() &&
        !creatingAgent
      ) {
        void startAgentSession();
      }
      return;
    }

    previousStatusRef.current = status;
    if (creatingAgent) return;
    if (status !== "ready_to_start") return;
    // Only on transition into Ready to Start (continuous agent loop).
    if (previous === "ready_to_start") return;

    void startAgentSession();
  }, [
    agentChatId,
    creatingAgent,
    layoutReady,
    startAgentSession,
    taskStatus,
    workingDirectory,
  ]);

  // Return to a bound task: re-subscribe the ACP chat event bridge.
  // Do not focus the composer — Tab is the only keyboard entry into the box.
  useEffect(() => {
    if (!layoutReady || !workingDirectory) return;
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
  }, [agentChatId, layoutReady, requestAttach, taskId, workingDirectory]);

  const gridTemplateColumns = detailCollapsed
    ? `${DETAIL_COLLAPSED_WIDTH_PX}px minmax(0, 1fr)`
    : agentCollapsed
      ? `minmax(0, 1fr) ${AGENT_COLLAPSED_WIDTH_PX}px`
      : `${detailPanelWidth}px minmax(0, 1fr)`;

  return (
    <div
      ref={containerRef}
      className={[
        "desktop-codebase-task-layout",
        detailCollapsed ? "is-detail-collapsed" : null,
        agentCollapsed ? "is-agent-collapsed" : null,
        skipGridTransition || isDetailResizing
          ? "is-skip-grid-transition"
          : null,
        isDetailResizing ? "is-resizing" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ gridTemplateColumns }}
      data-content-detail
      data-detail-collapsed={detailCollapsed ? "true" : "false"}
      data-agent-collapsed={agentCollapsed ? "true" : "false"}
    >
      <div
        className={[
          "desktop-codebase-task-layout__detail",
          detailCollapsed ? "is-collapsed" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          detailCollapsed
            ? { width: DETAIL_COLLAPSED_WIDTH_PX }
            : undefined
        }
      >
        {detailCollapsed ? (
          <button
            type="button"
            className="desktop-codebase-task-layout__detail-strip"
            title="Show task details (⇧[)"
            aria-label="Show task details"
            onClick={() => setDetailCollapsed(false)}
          >
            <span className="desktop-codebase-task-layout__detail-strip-label">
              Task
            </span>
          </button>
        ) : null}
        <div
          className="desktop-codebase-task-layout__detail-body"
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
            aria-valuemin={CODEBASE_SIDE_PANEL_MIN_WIDTH}
            aria-valuemax={CODEBASE_SIDE_PANEL_MAX_WIDTH}
            aria-valuenow={detailPanelWidth}
            title="Drag to resize"
            className="desktop-codebase-side-panel-resize"
            onPointerDown={(event) => {
              event.preventDefault();
              beginDetailResize(event.clientX);
            }}
          />
        ) : null}
      </div>
      <aside
        className={[
          "desktop-codebase-task-layout__terminal",
          agentCollapsed ? "is-collapsed" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          agentCollapsed ? { width: AGENT_COLLAPSED_WIDTH_PX } : undefined
        }
        aria-label="Task agent"
      >
        {agentCollapsed ? (
          <button
            type="button"
            className="desktop-terminal-strip"
            title="Show agent panel (])"
            aria-label="Show agent panel"
            onClick={() => {
              setSkipGridTransition(true);
              setAgentCollapsed(false);
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() =>
                  setSkipGridTransition(false),
                );
              });
            }}
          >
            <span className="desktop-terminal-strip__label">Agent</span>
          </button>
        ) : null}
        {workingDirectory ? (
          <div
            className="desktop-codebase-task-layout__terminal-body"
            aria-hidden={agentCollapsed || undefined}
          >
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
              viewScope="codebase"
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
                setSkipGridTransition(true);
                setAgentCollapsed(true);
                setDetailCollapsed(false);
                window.requestAnimationFrame(() => {
                  window.requestAnimationFrame(() =>
                    setSkipGridTransition(false),
                  );
                });
              }}
              onStartAgent={(options) => void startAgentSession(options)}
              startingAgent={creatingAgent}
              onStopAgent={endAgentSession}
              agentError={agentError}
              patchTaskValues={patchTaskValues}
            />
          </div>
        ) : agentCollapsed ? null : (
          <TerminalDirectoryGate
            fs={projectFs}
            showHeader={false}
            message="The terminal is unavailable until a working directory is defined for this project."
            onSelectDirectory={onWorkingDirectoryChange}
          />
        )}
      </aside>
    </div>
  );
}
