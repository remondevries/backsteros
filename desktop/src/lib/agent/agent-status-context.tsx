import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  emptyAgentActivitySummary,
  type AgentActivitySummary,
  type StatusBarAgentItem,
} from "./agent-activity";
import {
  clearDynamicIslandAgentsWorking,
  publishDynamicIslandAgentsWorking,
} from "../dynamic-island-agents-working";
import {
  registerClearLiveAgentWorking,
  registerMarkLiveAgentWorking,
} from "./clear-live-agent-working";
import type {
  AgentAttachRequest,
  AgentEndRequest,
  PendingBootstrapPrompt,
} from "./cursor-agent-cli";

/** Keep island heartbeat fresh so a crashed desktop ages out (~90s stale). */
const DYNAMIC_ISLAND_AGENTS_HEARTBEAT_MS = 30_000;

export type DesktopAgentStatusContextValue = {
  summary: AgentActivitySummary;
  statusItems: StatusBarAgentItem[];
  workingTaskIds: ReadonlySet<string>;
  openTaskIds: ReadonlySet<string>;
  setSummary: (summary: AgentActivitySummary) => void;
  setStatusItems: (items: StatusBarAgentItem[]) => void;
  setWorkingTaskIds: (taskIds: readonly string[]) => void;
  setOpenTaskIds: (taskIds: readonly string[]) => void;
  /**
   * Mark a task as agent-working for UI surfaces (list pulse, activity
   * “Agent is working…”, status bar) without relying on a live PTY hook.
   * Used by Research and by the Chat ACP turn lifecycle.
   */
  setTaskResearchWorking: (taskId: string, working: boolean) => void;
  isTaskWorking: (taskId: string) => boolean;
  /**
   * True when the ACP poll/socket path marks this task busy — excludes
   * optimistic research marks from Start/composer (stale list pulses).
   */
  isTaskAcpSessionBusy: (taskId: string) => boolean;
  isTaskAgentOpen: (taskId: string) => boolean;
  agentAttachRequest: AgentAttachRequest | null;
  agentEndRequest: AgentEndRequest | null;
  /** Start-agent optimistic user prompt before ACP ensure finishes. */
  pendingBootstrapPrompt: PendingBootstrapPrompt | null;
  setPendingBootstrapPrompt: (value: PendingBootstrapPrompt | null) => void;
  requestAttach: (request: AgentAttachRequest) => void;
  clearAttachRequest: () => void;
  requestEnd: (request: AgentEndRequest) => void;
  clearEndRequest: () => void;
  terminalCollapsed: boolean;
  setTerminalCollapsed: (collapsed: boolean) => void;
  expandTerminal: () => void;
  /**
   * True after Start / View / focus until Hide or Stop. Prevents the
   * "no agentChatId yet" window after clearAttach from collapsing the rail.
   */
  agentRailPinned: boolean;
  focusRequest: number;
  bumpFocusRequest: () => void;
  /** Expand the agent rail and focus the terminal. */
  focusAgentTab: () => void;
};

const TERMINAL_COLLAPSED_KEY = "backsteros-desktop.terminal-collapsed";

function readCollapsedFlag(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(TERMINAL_COLLAPSED_KEY);
    if (raw == null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

function writeCollapsedFlag(collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TERMINAL_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const DesktopAgentStatusContext =
  createContext<DesktopAgentStatusContextValue | null>(null);

export function DesktopAgentStatusProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [summary, setSummary] = useState<AgentActivitySummary>(
    emptyAgentActivitySummary,
  );
  const [statusItems, setStatusItems] = useState<StatusBarAgentItem[]>([]);
  const [ptyWorkingTaskIds, setWorkingTaskIdsState] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [researchWorkingTaskIds, setResearchWorkingTaskIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [openTaskIds, setOpenTaskIdsState] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [agentAttachRequest, setAgentAttachRequest] =
    useState<AgentAttachRequest | null>(null);
  const [agentEndRequest, setAgentEndRequest] =
    useState<AgentEndRequest | null>(null);
  const [pendingBootstrapPrompt, setPendingBootstrapPrompt] =
    useState<PendingBootstrapPrompt | null>(null);
  const [terminalCollapsed, setTerminalCollapsedState] = useState(
    readCollapsedFlag,
  );
  const [agentRailPinned, setAgentRailPinned] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);

  const setWorkingTaskIds = useCallback((taskIds: readonly string[]) => {
    setWorkingTaskIdsState((current) => {
      if (
        current.size === taskIds.length &&
        taskIds.every((id) => current.has(id))
      ) {
        return current;
      }
      return new Set(taskIds);
    });
  }, []);

  const setTaskResearchWorking = useCallback(
    (taskId: string, working: boolean) => {
      const id = taskId.trim();
      if (!id) return;
      setResearchWorkingTaskIds((current) => {
        const has = current.has(id);
        if (working === has) return current;
        const next = new Set(current);
        if (working) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [],
  );

  // Start / composer / ACP bootstrap mark this UI set without a live PTY hook.
  useEffect(() => {
    return registerMarkLiveAgentWorking((taskId) => {
      setResearchWorkingTaskIds((current) => {
        if (current.has(taskId)) return current;
        const next = new Set(current);
        next.add(taskId);
        return next;
      });
    });
  }, []);

  // Turn-complete / Stop / On Hold clear PTY marks and this UI set together.
  useEffect(() => {
    return registerClearLiveAgentWorking((taskId) => {
      setResearchWorkingTaskIds((current) => {
        if (!current.has(taskId)) return current;
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    });
  }, []);

  const workingTaskIds = useMemo(() => {
    if (researchWorkingTaskIds.size === 0) return ptyWorkingTaskIds;
    const merged = new Set(ptyWorkingTaskIds);
    for (const id of researchWorkingTaskIds) merged.add(id);
    return merged;
  }, [ptyWorkingTaskIds, researchWorkingTaskIds]);

  // Mirror live working set to Dynamic Island (file bridge).
  useEffect(() => {
    publishDynamicIslandAgentsWorking(workingTaskIds);
    const timer = window.setInterval(() => {
      publishDynamicIslandAgentsWorking(workingTaskIds);
    }, DYNAMIC_ISLAND_AGENTS_HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [workingTaskIds]);

  useEffect(() => {
    return () => {
      clearDynamicIslandAgentsWorking();
    };
  }, []);

  const setOpenTaskIds = useCallback((taskIds: readonly string[]) => {
    setOpenTaskIdsState((current) => {
      if (
        current.size === taskIds.length &&
        taskIds.every((id) => current.has(id))
      ) {
        return current;
      }
      return new Set(taskIds);
    });
  }, []);

  const setStatusItemsStable = useCallback((items: StatusBarAgentItem[]) => {
    setStatusItems((current) => {
      if (
        current.length === items.length &&
        current.every(
          (entry, index) =>
            entry.taskId === items[index]?.taskId &&
            entry.activity === items[index]?.activity &&
            entry.projectId === items[index]?.projectId &&
            entry.projectLabel === items[index]?.projectLabel,
        )
      ) {
        return current;
      }
      return items;
    });
  }, []);

  const setSummaryStable = useCallback((next: AgentActivitySummary) => {
    setSummary((current) => {
      if (
        current.working === next.working &&
        current.attention === next.attention &&
        current.idle === next.idle &&
        current.present === next.present &&
        current.total === next.total
      ) {
        return current;
      }
      return next;
    });
  }, []);

  const setTerminalCollapsed = useCallback((collapsed: boolean) => {
    writeCollapsedFlag(collapsed);
    setTerminalCollapsedState(collapsed);
    // Hide / Stop unpin; expanding from elsewhere pins via expandTerminal.
    if (collapsed) setAgentRailPinned(false);
  }, []);

  const expandTerminal = useCallback(() => {
    writeCollapsedFlag(false);
    setTerminalCollapsedState(false);
    setAgentRailPinned(true);
  }, []);

  const bumpFocusRequest = useCallback(() => {
    setFocusRequest((n) => n + 1);
  }, []);

  const focusAgentTab = useCallback(() => {
    writeCollapsedFlag(false);
    setTerminalCollapsedState(false);
    setAgentRailPinned(true);
    setFocusRequest((n) => n + 1);
  }, []);

  const requestAttach = useCallback((request: AgentAttachRequest) => {
    if (request.focusUi !== false) {
      writeCollapsedFlag(false);
      setTerminalCollapsedState(false);
      setAgentRailPinned(true);
      setFocusRequest((n) => n + 1);
    }
    setAgentAttachRequest(request);
  }, []);

  const clearAttachRequest = useCallback(() => {
    setAgentAttachRequest(null);
  }, []);

  const requestEnd = useCallback((request: AgentEndRequest) => {
    setAgentRailPinned(false);
    setAgentEndRequest(request);
  }, []);

  const clearEndRequest = useCallback(() => {
    setAgentEndRequest(null);
  }, []);

  const value = useMemo<DesktopAgentStatusContextValue>(
    () => ({
      summary,
      statusItems,
      workingTaskIds,
      openTaskIds,
      setSummary: setSummaryStable,
      setStatusItems: setStatusItemsStable,
      setWorkingTaskIds,
      setOpenTaskIds,
      setTaskResearchWorking,
      isTaskWorking: (taskId) => workingTaskIds.has(taskId),
      isTaskAcpSessionBusy: (taskId) => ptyWorkingTaskIds.has(taskId),
      isTaskAgentOpen: (taskId) => openTaskIds.has(taskId),
      agentAttachRequest,
      agentEndRequest,
      pendingBootstrapPrompt,
      setPendingBootstrapPrompt,
      requestAttach,
      clearAttachRequest,
      requestEnd,
      clearEndRequest,
      terminalCollapsed,
      setTerminalCollapsed,
      expandTerminal,
      agentRailPinned,
      focusRequest,
      bumpFocusRequest,
      focusAgentTab,
    }),
    [
      agentAttachRequest,
      agentEndRequest,
      agentRailPinned,
      bumpFocusRequest,
      clearAttachRequest,
      clearEndRequest,
      expandTerminal,
      focusAgentTab,
      focusRequest,
      openTaskIds,
      pendingBootstrapPrompt,
      ptyWorkingTaskIds,
      requestAttach,
      requestEnd,
      setPendingBootstrapPrompt,
      setOpenTaskIds,
      setStatusItemsStable,
      setSummaryStable,
      setTerminalCollapsed,
      setTaskResearchWorking,
      setWorkingTaskIds,
      statusItems,
      summary,
      terminalCollapsed,
      workingTaskIds,
    ],
  );

  return (
    <DesktopAgentStatusContext.Provider value={value}>
      {children}
    </DesktopAgentStatusContext.Provider>
  );
}

export function useDesktopAgentStatus(): DesktopAgentStatusContextValue {
  const ctx = useContext(DesktopAgentStatusContext);
  if (!ctx) {
    throw new Error(
      "useDesktopAgentStatus must be used within DesktopAgentStatusProvider",
    );
  }
  return ctx;
}

export function useDesktopAgentStatusOptional(): DesktopAgentStatusContextValue | null {
  return useContext(DesktopAgentStatusContext);
}
