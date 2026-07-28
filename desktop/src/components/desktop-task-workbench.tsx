import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { shouldHandleGlobalShortcut } from "@backsteros/ui";

import { DesktopAgentChatPanel } from "./desktop-agent-chat-panel";
import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
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
 * Idle tasks show the draft-hero empty chat (same as after /clear) with an
 * extra Implement-ticket action. ] toggles the chat rail whenever a task is
 * selected (left content list uses ⇧[).
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

  const [layoutReady, setLayoutReady] = useState(
    () => railVisible && !terminalCollapsed,
  );

  const toggleAgentCollapsed = useCallback(() => {
    if (terminalCollapsed) {
      expandTerminal();
      return;
    }
    setTerminalCollapsed(true);
  }, [expandTerminal, setTerminalCollapsed, terminalCollapsed]);

  useEffect(() => {
    if (!railVisible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleAgentCollapsed();
    }

    // Capture so editor/global handlers don't swallow ].
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [railVisible, toggleAgentCollapsed]);

  useEffect(() => {
    if (!railVisible || terminalCollapsed) {
      setLayoutReady(false);
      return;
    }
    setLayoutReady(false);
    const timer = window.setTimeout(
      () => setLayoutReady(true),
      LAYOUT_READY_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [railVisible, terminalCollapsed, taskId]);

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

  const railWidth = !railVisible
    ? 0
    : terminalCollapsed
      ? TERMINAL_COLLAPSED_WIDTH
      : TERMINAL_EXPANDED_WIDTH;

  const panelCollapsed = !railVisible || terminalCollapsed;

  return (
    <div className="desktop-task-workbench">
      <div className="desktop-task-workbench__main">{children}</div>
      <aside
        className={[
          "desktop-task-workbench__terminal",
          "desktop-task-workbench__chat",
          !railVisible ? "is-absent" : null,
          railVisible && terminalCollapsed ? "is-collapsed" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ width: railWidth }}
        aria-label="Agent chat"
        aria-hidden={!railVisible || undefined}
      >
        {railVisible && terminalCollapsed ? (
          <button
            type="button"
            className="desktop-terminal-strip"
            title="Show agent panel (])"
            onClick={() => expandTerminal()}
          >
            <span className="desktop-terminal-strip__label">Agent</span>
          </button>
        ) : null}
        {railVisible && taskId ? (
          <div
            className="desktop-task-workbench__terminal-body"
            aria-hidden={panelCollapsed || undefined}
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
              onHide={() => setTerminalCollapsed(true)}
              onStartAgent={(options) => void startAgentSession(options)}
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
