import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { AgentSurfaceQuickOpenKind } from "../../../lib/agent/agent-surface-quick-open";
import type { AgentChatChangedFile } from "../../../lib/agent/agent-chat-changed-files";
import type { AgentChatMessage } from "../../../lib/agent/agent-chat-transcript";
import {
  addAgentSurfaceTab,
  closeAgentSurfaceTab,
  ensureChatTab,
  hydrateAgentSurfaceTabs,
  readAgentSurfaceTabs,
  updateAgentSurfaceTab,
  writeAgentSurfaceTabs,
  type AgentSurfaceTabKind,
  type AgentSurfaceTabsState,
} from "../../../lib/agent/agent-surface-tabs";
import { CodebaseTaskAgentPane } from "../codebase-task-agent-pane";
import { AgentSurfaceBrowserPane } from "./agent-surface-browser-pane";
import { AgentSurfaceCollapsedStrip } from "./agent-surface-collapsed-strip";
import { AgentSurfaceDiffPane } from "./agent-surface-diff-pane";
import { AgentSurfaceEmptyPicker } from "./agent-surface-empty-picker";
import { AgentSurfaceFilesPane } from "./agent-surface-files-pane";
import { AgentSurfacePlanPane } from "./agent-surface-plan-pane";
import { AgentSurfaceTabBar } from "./agent-surface-tab-bar";

export type TaskAgentSurfacesHostProps = {
  taskId: string;
  taskNumber?: number | null;
  taskTitle: string;
  taskDescription?: string | null;
  taskDisplayId?: string | null;
  projectId: string | null;
  projectKey?: string | null;
  projectLabel?: string;
  cwd: string | null;
  isCodebaseProject: boolean;
  agentChatId: string | null;
  onAgentChatIdChange: (chatId: string | null) => void | Promise<void>;
  /** Collapse the right surfaces pane (desktop hide control). */
  onHide?: () => void;
  /** iPad: panel is collapsed to the vertical tab strip. */
  collapsed?: boolean;
  /** Expand from the collapsed strip. */
  onExpand?: () => void;
  /** iPhone: tabs live in the nav header — hide the inline strip. */
  hideInlineTabBar?: boolean;
  /** Notify parent when tab chrome changes (for phone header). */
  onTabsControllerChange?: (controller: SurfaceTabsController | null) => void;
};

/** Imperative tab chrome for embedding Agent/Browser tabs in the nav header. */
export type SurfaceTabsController = {
  state: AgentSurfaceTabsState;
  cwdAvailable: boolean;
  isCodebaseProject: boolean;
  diffAvailable: boolean;
  activate: (id: string) => void;
  close: (id: string) => void;
  add: (kind: AgentSurfaceTabKind) => void;
};

/**
 * Right-pane host: empty picker → tab bar + Agent / Browser / Files / Plan / Diff.
 * Tabs persist per task; a bound agentChatId always opens the Chat surface so
 * the same session is reachable from iPad, iPhone, and desktop.
 */
export function TaskAgentSurfacesHost({
  taskId,
  taskNumber = null,
  taskTitle,
  taskDescription = null,
  taskDisplayId = null,
  projectId,
  projectKey = null,
  projectLabel = "Task",
  cwd,
  isCodebaseProject,
  agentChatId,
  onAgentChatIdChange,
  onHide,
  collapsed = false,
  onExpand,
  hideInlineTabBar = false,
  onTabsControllerChange,
}: TaskAgentSurfacesHostProps) {
  const [state, setState] = useState<AgentSurfaceTabsState>(() =>
    readAgentSurfaceTabs(taskId),
  );
  const [changedFiles, setChangedFiles] = useState<AgentChatChangedFile[]>([]);
  const [planMarkdown, setPlanMarkdown] = useState<string | null>(null);
  const [planSteps, setPlanSteps] = useState<
    NonNullable<AgentChatMessage["planSteps"]>
  >([]);
  const agentChatIdRef = useRef(agentChatId);
  agentChatIdRef.current = agentChatId;
  const skipPersistRef = useRef(true);
  const endChatSessionRef = useRef<(() => Promise<void>) | null>(null);

  const diffAvailable = changedFiles.length > 0;

  // Restore tabs when switching tasks (memory first, then SecureStore).
  useEffect(() => {
    let cancelled = false;
    skipPersistRef.current = true;
    setState(readAgentSurfaceTabs(taskId));
    setChangedFiles([]);
    setPlanMarkdown(null);
    setPlanSteps([]);

    void hydrateAgentSurfaceTabs(taskId).then((loaded) => {
      if (cancelled) return;
      const chatId = agentChatIdRef.current?.trim();
      const next =
        chatId && !loaded.tabs.some((tab) => tab.kind === "chat")
          ? ensureChatTab(loaded.tabs)
          : loaded;
      setState(next);
      skipPersistRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Bound session → always show Chat (cross-device pickup).
  useEffect(() => {
    const chatId = agentChatId?.trim();
    if (!chatId) return;
    setState((current) => {
      if (current.tabs.some((tab) => tab.kind === "chat")) {
        if (
          current.activeId &&
          current.tabs.some((tab) => tab.id === current.activeId)
        ) {
          return current;
        }
        return ensureChatTab(current.tabs);
      }
      return ensureChatTab(current.tabs);
    });
  }, [agentChatId]);

  useEffect(() => {
    if (skipPersistRef.current) return;
    writeAgentSurfaceTabs(taskId, state);
  }, [state, taskId]);

  const cwdAvailable = Boolean(cwd?.trim());
  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeId) ?? null,
    [state.activeId, state.tabs],
  );
  const chatTabOpen = useMemo(
    () => state.tabs.some((tab) => tab.kind === "chat"),
    [state.tabs],
  );
  const chatActive = activeTab?.kind === "chat";

  const addSurface = useCallback((kind: AgentSurfaceTabKind) => {
    setState((current) => addAgentSurfaceTab(current.tabs, kind));
  }, []);

  const onAddFromPicker = useCallback(
    (kind: AgentSurfaceQuickOpenKind) => {
      addSurface(kind);
    },
    [addSurface],
  );

  const handleCloseTab = useCallback(
    (id: string) => {
      const tab = state.tabs.find((entry) => entry.id === id);
      // Closing Chat ends the ACP session (desktop parity — no Stop button).
      if (tab?.kind === "chat" && agentChatIdRef.current?.trim()) {
        void endChatSessionRef.current?.();
      }
      setState((current) =>
        closeAgentSurfaceTab(current.tabs, id, current.activeId),
      );
    },
    [state.tabs],
  );

  const activateTab = useCallback((id: string) => {
    setState((current) => ({ ...current, activeId: id }));
  }, []);

  const openDiffTab = useCallback(() => {
    setState((current) => addAgentSurfaceTab(current.tabs, "diff"));
  }, []);

  const handleAgentSurfaceDataChange = useCallback(
    (data: {
      changedFiles: AgentChatChangedFile[];
      proposedPlanMarkdown: string | null;
      planSteps: NonNullable<AgentChatMessage["planSteps"]>;
    }) => {
      setChangedFiles(data.changedFiles);
      setPlanMarkdown(data.proposedPlanMarkdown);
      setPlanSteps(data.planSteps);
    },
    [],
  );

  useEffect(() => {
    if (!onTabsControllerChange) return;
    onTabsControllerChange({
      state,
      cwdAvailable,
      isCodebaseProject,
      diffAvailable,
      activate: activateTab,
      close: handleCloseTab,
      add: addSurface,
    });
  }, [
    activateTab,
    addSurface,
    cwdAvailable,
    diffAvailable,
    handleCloseTab,
    isCodebaseProject,
    onTabsControllerChange,
    state,
  ]);

  useEffect(() => {
    return () => {
      onTabsControllerChange?.(null);
    };
  }, [onTabsControllerChange]);

  const nonChatBody = (() => {
    if (!activeTab || activeTab.kind === "chat") return null;

    switch (activeTab.kind) {
      case "browser":
        return (
          <AgentSurfaceBrowserPane
            initialUrl={activeTab.resourceId}
            onUrlChange={(url, title) => {
              setState((current) => ({
                ...current,
                tabs: updateAgentSurfaceTab(current.tabs, activeTab.id, {
                  resourceId: url,
                  title:
                    title.trim() && title !== "Browser"
                      ? title.slice(0, 40)
                      : activeTab.title,
                }),
              }));
            }}
          />
        );
      case "files":
        return (
          <AgentSurfaceFilesPane projectId={projectId} cwd={cwd} />
        );
      case "plan":
        return (
          <AgentSurfacePlanPane
            proposedPlanMarkdown={planMarkdown}
            planSteps={planSteps}
          />
        );
      case "diff":
        return <AgentSurfaceDiffPane files={changedFiles} />;
      default:
        return null;
    }
  })();

  return (
    <View style={styles.root} accessibilityLabel="Task surfaces">
      {collapsed && onExpand ? (
        <AgentSurfaceCollapsedStrip
          tabs={state.tabs}
          activeId={state.activeId}
          isCodebaseProject={isCodebaseProject}
          diffAvailable={diffAvailable}
          cwdAvailable={cwdAvailable}
          chatAvailable
          onActivateTab={activateTab}
          onOpenKind={addSurface}
          onExpand={onExpand}
        />
      ) : null}

      <View
        style={collapsed ? styles.bodyCollapsed : styles.body}
        pointerEvents={collapsed ? "none" : "auto"}
        accessibilityElementsHidden={collapsed}
        importantForAccessibility={
          collapsed ? "no-hide-descendants" : "auto"
        }
      >
        {!collapsed && !hideInlineTabBar ? (
          <AgentSurfaceTabBar
            tabs={state.tabs}
            activeId={state.activeId}
            cwdAvailable={cwdAvailable}
            isCodebaseProject={isCodebaseProject}
            diffAvailable={diffAvailable}
            onActivate={activateTab}
            onClose={handleCloseTab}
            onAddSurface={addSurface}
            onHide={onHide}
          />
        ) : null}
        <View style={styles.paneHost}>
          {!activeTab ? (
            <AgentSurfaceEmptyPicker
              onAddSurface={onAddFromPicker}
              cwdAvailable={cwdAvailable}
              chatAvailable
              isCodebaseProject={isCodebaseProject}
              diffAvailable={diffAvailable}
            />
          ) : null}

          {chatTabOpen ? (
            <View
              style={chatActive ? styles.paneActive : styles.paneInactive}
              pointerEvents={chatActive && !collapsed ? "auto" : "none"}
              accessibilityElementsHidden={!chatActive || collapsed}
              importantForAccessibility={
                chatActive && !collapsed ? "auto" : "no-hide-descendants"
              }
            >
              <CodebaseTaskAgentPane
                taskId={taskId}
                taskNumber={taskNumber}
                taskTitle={taskTitle}
                taskDescription={taskDescription}
                taskDisplayId={taskDisplayId}
                projectId={projectId ?? taskId}
                projectKey={projectKey}
                projectLabel={projectLabel}
                cwd={cwd}
                agentChatId={agentChatId}
                onAgentChatIdChange={onAgentChatIdChange}
                endSessionRef={endChatSessionRef}
                onAgentSurfaceDataChange={handleAgentSurfaceDataChange}
                onOpenDiff={openDiffTab}
              />
            </View>
          ) : null}

          {nonChatBody && activeTab && activeTab.kind !== "chat" ? (
            <View style={styles.paneActive}>{nonChatBody}</View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "transparent",
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyCollapsed: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  paneHost: {
    flex: 1,
    minHeight: 0,
  },
  paneActive: {
    flex: 1,
    minHeight: 0,
  },
  paneInactive: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
});
