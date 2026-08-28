import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { shouldHandleGlobalShortcut } from "@backsteros/ui";

import { DesktopAgentChatPanel } from "./desktop-agent-chat-panel";
import {
  readAgentPanelCollapsed,
  writeAgentPanelCollapsed,
} from "../lib/agent/agent-panel-collapsed";
import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
import { useDesktopAgentStatus } from "../lib/agent/agent-status-context";
import { buildEmailAgentAcpPrompt } from "../lib/agent/email-agent-prompt";
import { useDesktopEmailAgentSession } from "../lib/agent/use-desktop-email-agent-session";
import type { AgentMailMessageDetail } from "@backsteros/contracts";
import {
  resolveTaskLayoutColumnWidths,
  useTaskDetailSidePanelWidth,
  type TaskLayoutCollapseMode,
} from "../lib/task-detail-side-panel-layout";

const LAYOUT_READY_DELAY_MS = 220;

function collapseModeFor(agentCollapsed: boolean): TaskLayoutCollapseMode {
  return agentCollapsed ? "agent-collapsed" : "expanded";
}

export type DesktopEmailLayoutProps = {
  children: ReactNode;
  taskId: string;
  message: AgentMailMessageDetail | null;
  onAssistantTurnComplete?: (text: string) => void;
  onConceptSaved?: () => void;
};

/**
 * Email detail + chat-only agent rail. ] toggles the agent column (default collapsed).
 */
export function DesktopEmailLayout({
  children,
  taskId,
  message,
  onAssistantTurnComplete,
  onConceptSaved,
}: DesktopEmailLayoutProps) {
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
    agentChatId,
    creatingAgent,
    agentError,
    startAgentSession,
    endAgentSession,
  } = useDesktopEmailAgentSession({ taskId, message });

  const [layoutReady, setLayoutReady] = useState(false);
  const [agentCollapsed, setAgentCollapsedState] = useState(() =>
    readAgentPanelCollapsed("email", true),
  );
  const setAgentCollapsed = useCallback(
    (update: boolean | ((current: boolean) => boolean)) => {
      setAgentCollapsedState((current) => {
        const next = typeof update === "function" ? update(current) : update;
        writeAgentPanelCollapsed("email", next);
        return next;
      });
    },
    [],
  );
  const [collapseAnimating, setCollapseAnimating] = useState(false);
  const collapseAnimTimerRef = useRef<number | null>(null);
  const collapseRafRef = useRef<number | null>(null);
  const layoutElRef = useRef<HTMLDivElement | null>(null);
  const previousTaskIdRef = useRef<string | null>(null);
  const reconcileKeyRef = useRef<string | null>(null);

  const {
    containerRef,
    panelWidth: detailPanelWidth,
    containerWidth,
    isResizing: isDetailResizing,
  } = useTaskDetailSidePanelWidth(taskId, true);

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

  useLayoutEffect(() => {
    applyColumnWidths(collapseModeFor(agentCollapsed), detailPanelWidth);
    if (!agentCollapsed) {
      const raf = window.requestAnimationFrame(() => {
        applyColumnWidths("expanded", detailPanelWidth);
      });
      return () => window.cancelAnimationFrame(raf);
    }
  }, [agentCollapsed, applyColumnWidths, containerWidth, detailPanelWidth]);

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
        }, LAYOUT_READY_DELAY_MS);
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

  const toggleAgentCollapsed = useCallback(() => {
    beginCollapseAnimation(() => {
      setAgentCollapsed((current) => !current);
    });
  }, [beginCollapseAnimation]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleAgentCollapsed();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [toggleAgentCollapsed]);

  useEffect(() => {
    if (agentCollapsed) {
      setLayoutReady(false);
      return;
    }
    setLayoutReady(false);
    const timer = window.setTimeout(
      () => setLayoutReady(true),
      LAYOUT_READY_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [agentCollapsed, taskId]);

  useEffect(() => {
    const taskChanged = previousTaskIdRef.current !== taskId;
    previousTaskIdRef.current = taskId;
    if (taskChanged) {
      reconcileKeyRef.current = null;
    }
  }, [taskId]);

  useEffect(() => {
    if (!layoutReady || agentCollapsed) return;
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
  }, [agentChatId, agentCollapsed, layoutReady, requestAttach, taskId]);

  const handleAssistantTurnComplete = useCallback(
    (text: string) => {
      onAssistantTurnComplete?.(text);
      onConceptSaved?.();
    },
    [onAssistantTurnComplete, onConceptSaved],
  );

  const startAgentSessionExpanded = useCallback(
    (options?: Parameters<typeof startAgentSession>[0]) => {
      beginCollapseAnimation(() => setAgentCollapsed(false));
      return startAgentSession(options);
    },
    [beginCollapseAnimation, startAgentSession],
  );

  const buildAgentPrompt = useCallback(
    (userText: string) => {
      if (!message) return userText.trim();
      return buildEmailAgentAcpPrompt(userText, message, { depth: "lean" });
    },
    [message],
  );

  return (
    <div
      ref={setLayoutRef}
      className={[
        "desktop-task-layout",
        agentCollapsed ? "is-agent-collapsed" : null,
        collapseAnimating ? "is-collapse-animating" : null,
        isDetailResizing ? "is-resizing" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-detail
      data-agent-collapsed={agentCollapsed ? "true" : "false"}
    >
      <div className="desktop-task-layout__detail">
        <div className="desktop-task-layout__detail-body">{children}</div>
      </div>
      <aside
        className={[
          "desktop-task-layout__terminal",
          agentCollapsed ? "is-collapsed" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Email agent"
      >
        <div className="desktop-task-layout__terminal-body">
          <DesktopAgentChatPanel
            key={taskId}
            taskId={taskId}
            projectLabel="Email"
            cwd="~"
            agentChatId={agentChatId}
            collapsed={agentCollapsed}
            collapseAnimating={collapseAnimating}
            layoutReady={layoutReady}
            viewScope="rail"
            chatOnly
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
              beginCollapseAnimation(() => setAgentCollapsed(true));
            }}
            onExpand={() => {
              beginCollapseAnimation(() => setAgentCollapsed(false));
            }}
            onStartAgent={(options) => void startAgentSessionExpanded(options)}
            startingAgent={creatingAgent}
            onStopAgent={endAgentSession}
            agentError={agentError}
            onAssistantTurnComplete={handleAssistantTurnComplete}
            buildAgentPrompt={buildAgentPrompt}
          />
        </div>
      </aside>
    </div>
  );
}
