import { useEffect, useRef, useState, type ReactNode } from "react";

import { DesktopAgentChatPanel } from "./desktop-agent-chat-panel";
import { useDesktopAgentStatus } from "../lib/agent/agent-status-context";
import {
  useDesktopTaskAgentSession,
  type DesktopTaskAgentSessionSummary,
} from "../lib/agent/use-desktop-task-agent-session";

const TERMINAL_EXPANDED_WIDTH = 420;
const TERMINAL_COLLAPSED_WIDTH = 46;
const LAYOUT_READY_DELAY_MS = 220;

export type DesktopTaskWorkbenchProps = {
  children: ReactNode;
  taskId: string | null;
  projectId?: string | null;
  projectLabel?: string;
  taskDisplayId?: string | null;
  cwd?: string | null;
  /** Cursor chat id from core for the selected task. */
  agentChatId?: string | null;
  /** Task status — used to stop working animations when On Hold. */
  taskStatus?: string | null;
  taskSummary: DesktopTaskAgentSessionSummary;
  patchTaskValues: (values: Record<string, unknown>) => Promise<void>;
};

/**
 * Task detail + agent chat rail (non-codebase).
 *
 * The rail stays available as a Start agent square until a session is bound;
 * Hide collapses to a strip only while an agent is still present.
 */
export function DesktopTaskWorkbench({
  children,
  taskId,
  projectId = null,
  projectLabel = "Task",
  taskDisplayId = null,
  cwd = null,
  agentChatId = null,
  taskStatus = null,
  taskSummary,
  patchTaskValues,
}: DesktopTaskWorkbenchProps) {
  const {
    terminalCollapsed,
    setTerminalCollapsed,
    expandTerminal,
    bumpFocusRequest,
    focusRequest,
    agentAttachRequest,
    clearAttachRequest,
    agentEndRequest,
    clearEndRequest,
    agentRailPinned,
    setSummary,
    setStatusItems,
    setWorkingTaskIds,
    setOpenTaskIds,
  } = useDesktopAgentStatus();

  const previousTaskIdRef = useRef<string | null>(null);
  const hasBoundAgent = Boolean(agentChatId?.trim());
  const {
    creatingAgent,
    agentError,
    startAgentSession,
    endAgentSession,
  } = useDesktopTaskAgentSession({
    taskId: taskId ?? "",
    agentChatId,
    taskSummary,
    patchTaskValues,
  });

  // Rail is always present for a selected task (Start agent square when idle).
  const railVisible = Boolean(taskId);
  const sessionActive =
    hasBoundAgent || Boolean(agentAttachRequest) || agentRailPinned;
  // Idle Start square cannot collapse — only a live/pinned session may hide.
  const allowCollapse = sessionActive;

  const [layoutReady, setLayoutReady] = useState(
    () => railVisible && !terminalCollapsed,
  );

  useEffect(() => {
    if (!railVisible || (terminalCollapsed && allowCollapse)) {
      setLayoutReady(false);
      return;
    }
    setLayoutReady(false);
    const timer = window.setTimeout(
      () => setLayoutReady(true),
      LAYOUT_READY_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [allowCollapse, railVisible, terminalCollapsed, taskId]);

  // No active session → keep the Start agent square expanded.
  useEffect(() => {
    if (!taskId) return;
    if (sessionActive) return;
    if (terminalCollapsed) setTerminalCollapsed(false);
  }, [sessionActive, setTerminalCollapsed, taskId, terminalCollapsed]);

  // Bound agent on this task → slide the rail open (unless user hid it).
  useEffect(() => {
    if (!taskId || !hasBoundAgent) {
      previousTaskIdRef.current = taskId;
      return;
    }
    const taskChanged = previousTaskIdRef.current !== taskId;
    previousTaskIdRef.current = taskId;
    if (terminalCollapsed && (taskChanged || agentRailPinned)) {
      expandTerminal();
    }
  }, [
    agentRailPinned,
    expandTerminal,
    hasBoundAgent,
    taskId,
    terminalCollapsed,
  ]);

  // Auto-focus the agent terminal once the rail is open and laid out.
  useEffect(() => {
    if (!layoutReady || !railVisible || terminalCollapsed) return;
    if (!hasBoundAgent && !agentAttachRequest) return;
    bumpFocusRequest();
  }, [
    agentAttachRequest,
    bumpFocusRequest,
    hasBoundAgent,
    layoutReady,
    railVisible,
    taskId,
    terminalCollapsed,
  ]);

  const railWidth = !railVisible
    ? 0
    : terminalCollapsed && allowCollapse
      ? TERMINAL_COLLAPSED_WIDTH
      : TERMINAL_EXPANDED_WIDTH;

  const panelCollapsed = !railVisible || (terminalCollapsed && allowCollapse);

  return (
    <div className="desktop-task-workbench">
      <div className="desktop-task-workbench__main">{children}</div>
      <aside
        className={[
          "desktop-task-workbench__terminal",
          "desktop-task-workbench__chat",
          !railVisible ? "is-absent" : null,
          railVisible && terminalCollapsed && allowCollapse
            ? "is-collapsed"
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ width: railWidth }}
        aria-label="Agent chat"
        aria-hidden={!railVisible || undefined}
      >
        {railVisible && terminalCollapsed && allowCollapse ? (
          <button
            type="button"
            className="desktop-terminal-strip"
            title="Agent session available"
            onClick={() => expandTerminal()}
          >
            <span className="desktop-terminal-strip__label">Agent</span>
          </button>
        ) : null}
        {railVisible && taskId ? (
          <div
            className="desktop-task-workbench__terminal-body"
            hidden={panelCollapsed}
          >
            <DesktopAgentChatPanel
              key={taskId}
              taskId={taskId}
              projectId={projectId}
              projectLabel={projectLabel}
              taskDisplayId={taskDisplayId}
              cwd={cwd}
              agentChatId={agentChatId}
              taskStatus={taskStatus}
              collapsed={panelCollapsed}
              layoutReady={layoutReady}
              agentAttachRequest={agentAttachRequest}
              onAgentAttachRequestHandled={clearAttachRequest}
              agentEndRequest={agentEndRequest}
              onAgentEndRequestHandled={clearEndRequest}
              onAgentActivitySummaryChange={setSummary}
              onWorkingTaskIdsChange={setWorkingTaskIds}
              onAgentStatusItemsChange={setStatusItems}
              onAgentOpenTaskIdsChange={setOpenTaskIds}
              focusRequest={focusRequest}
              onHide={
                allowCollapse ? () => setTerminalCollapsed(true) : undefined
              }
              onStartAgent={() => void startAgentSession()}
              startingAgent={creatingAgent}
              onStopAgent={endAgentSession}
              agentError={agentError}
              patchTaskValues={patchTaskValues}
            />
          </div>
        ) : null}
      </aside>
    </div>
  );
}
