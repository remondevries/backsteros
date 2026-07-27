import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  migrateLegacyTaskStatus,
  TerminalDirectoryGate,
  shouldHandleGlobalShortcut,
} from "@backsteros/ui";

import { DesktopAgentChatPanel } from "./desktop-agent-chat-panel";
import { hasAgentViewport } from "./desktop-terminal-panel";
import { useDesktopAgentStatus } from "../lib/agent/agent-status-context";
import { normalizeWorkingDirectory } from "../lib/agent/project-workspace";
import {
  useDesktopTaskAgentSession,
  type DesktopTaskAgentSessionSummary,
} from "../lib/agent/use-desktop-task-agent-session";
import { projectFs } from "../lib/project-fs";

const LAYOUT_READY_DELAY_MS = 220;
const DETAIL_COLLAPSED_WIDTH_PX = 46;

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
 * session (resume only if the agent is no longer live in that PTY). Terminal
 * remains the default tab while the chat UI is experimental.
 *
 * ⇧[ toggles the left task-detail column so the chat pane can go wider.
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
    bumpFocusRequest,
    requestAttach,
  } = useDesktopAgentStatus();

  const {
    creatingAgent,
    agentError,
    startAgentSession,
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
  const previousTaskIdRef = useRef<string | null>(null);
  /** Tracks last observed status so Ready to Start auto-start is a transition. */
  const previousStatusRef = useRef<string | null>(null);
  /** One viewer-reconcile attach per task/chat visit. */
  const reconcileKeyRef = useRef<string | null>(null);

  const toggleDetailCollapsed = useCallback(() => {
    setDetailCollapsed((current) => !current);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isCodebaseDetailPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleDetailCollapsed();
    }

    // Capture so we win over the global content-side-panel ⇧[ handler.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [toggleDetailCollapsed]);

  useEffect(() => {
    if (!workingDirectory) {
      setLayoutReady(false);
      return;
    }
    setLayoutReady(false);
    const timer = window.setTimeout(
      () => setLayoutReady(true),
      LAYOUT_READY_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [taskId, workingDirectory]);

  useEffect(() => {
    const taskChanged = previousTaskIdRef.current !== taskId;
    previousTaskIdRef.current = taskId;
    if (taskChanged) {
      reconcileKeyRef.current = null;
      previousStatusRef.current = null;
      setDetailCollapsed(false);
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

  // Auto-focus the terminal once the layout is ready so the user can type.
  useEffect(() => {
    if (!layoutReady || !workingDirectory) return;
    if (!agentChatId?.trim()) return;
    bumpFocusRequest();
  }, [agentChatId, bumpFocusRequest, layoutReady, taskId, workingDirectory]);

  // Return to a bound task with no UI viewer: recreate viewer + reattach.
  // Skip when a viewer already exists (e.g. Start agent just opened one).
  useEffect(() => {
    if (!layoutReady || !workingDirectory) return;
    const chatId = agentChatId?.trim();
    if (!chatId) {
      reconcileKeyRef.current = null;
      return;
    }
    const key = `${taskId}:${chatId.toLowerCase()}`;
    if (reconcileKeyRef.current === key) return;
    if (hasAgentViewport(taskId)) {
      reconcileKeyRef.current = key;
      return;
    }
    reconcileKeyRef.current = key;
    requestAttach({
      taskId,
      chatId,
      forceReattach: true,
      focusUi: true,
    });
  }, [agentChatId, layoutReady, requestAttach, taskId, workingDirectory]);

  return (
    <div
      className={[
        "desktop-codebase-task-layout",
        detailCollapsed ? "is-detail-collapsed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-detail
      data-detail-collapsed={detailCollapsed ? "true" : "false"}
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
      </div>
      <aside
        className="desktop-codebase-task-layout__terminal"
        aria-label="Task agent"
      >
        {workingDirectory ? (
          <div className="desktop-codebase-task-layout__terminal-body">
            <DesktopAgentChatPanel
              key={taskId}
              taskId={taskId}
              projectId={projectId}
              projectLabel={projectLabel}
              taskDisplayId={taskDisplayId}
              cwd={workingDirectory}
              agentChatId={agentChatId}
              taskStatus={taskStatus}
              collapsed={false}
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
              onStartAgent={() => void startAgentSession()}
              startingAgent={creatingAgent}
              onStopAgent={endAgentSession}
              agentError={agentError}
              patchTaskValues={patchTaskValues}
            />
          </div>
        ) : (
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
