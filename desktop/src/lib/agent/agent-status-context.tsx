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
import { useDesktopApi } from "../api-context";
import {
  registerClearLiveAgentWorking,
  registerMarkLiveAgentWorking,
} from "./clear-live-agent-working";

/** Keep island heartbeat fresh so a crashed desktop ages out (~90s stale). */
const DYNAMIC_ISLAND_AGENTS_HEARTBEAT_MS = 30_000;
/** Shared BacksterOS core presence TTL is 45s — heartbeat faster than that. */
const SHARED_AGENT_PRESENCE_HEARTBEAT_MS = 15_000;
const SHARED_AGENT_PRESENCE_POLL_MS = 12_000;

const EMPTY_WORKING_TASK_IDS: ReadonlySet<string> = new Set();

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
   * “Agent is working…”, status bar) without a Chat rail.
   * Used by Research and by shared presence writers (e.g. T3).
   */
  setTaskResearchWorking: (taskId: string, working: boolean) => void;
  isTaskWorking: (taskId: string) => boolean;
  /** @deprecated ACP session busy — always false after desktop Chat removal. */
  isTaskAcpSessionBusy: (taskId: string) => boolean;
  isTaskAgentOpen: (taskId: string) => boolean;
};

const DesktopAgentStatusContext =
  createContext<DesktopAgentStatusContextValue | null>(null);

export function DesktopAgentStatusProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { client } = useDesktopApi();
  const [summary, setSummary] = useState<AgentActivitySummary>(
    emptyAgentActivitySummary,
  );
  const [statusItems, setStatusItems] = useState<StatusBarAgentItem[]>([]);
  const [localWorkingTaskIds, setWorkingTaskIdsState] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [researchWorkingTaskIds, setResearchWorkingTaskIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [remoteWorkingTaskIds, setRemoteWorkingTaskIds] = useState<
    ReadonlySet<string>
  >(EMPTY_WORKING_TASK_IDS);
  const [openTaskIds, setOpenTaskIdsState] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

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

  useEffect(() => {
    return registerMarkLiveAgentWorking((taskId) => {
      setResearchWorkingTaskIds((current) => {
        if (current.has(taskId)) return current;
        const next = new Set(current);
        next.add(taskId);
        return next;
      });
      void client
        .requestJson(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-presence`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ source: "desktop" }),
          },
        )
        .catch(() => {});
    });
  }, [client]);

  useEffect(() => {
    return registerClearLiveAgentWorking((taskId) => {
      setResearchWorkingTaskIds((current) => {
        if (!current.has(taskId)) return current;
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      void client
        .requestJson(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-presence`,
          {
            method: "DELETE",
          },
        )
        .catch(() => {});
    });
  }, [client]);

  const mergedLocalWorking = useMemo(() => {
    if (researchWorkingTaskIds.size === 0) return localWorkingTaskIds;
    const merged = new Set(localWorkingTaskIds);
    for (const id of researchWorkingTaskIds) merged.add(id);
    return merged;
  }, [localWorkingTaskIds, researchWorkingTaskIds]);

  const workingTaskIds = useMemo(() => {
    if (remoteWorkingTaskIds.size === 0) return mergedLocalWorking;
    const merged = new Set(mergedLocalWorking);
    for (const id of remoteWorkingTaskIds) merged.add(id);
    return merged;
  }, [mergedLocalWorking, remoteWorkingTaskIds]);

  useEffect(() => {
    const heartbeat = () => {
      for (const taskId of mergedLocalWorking) {
        void client
          .requestJson(
            `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-presence`,
            {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ source: "desktop" }),
            },
          )
          .catch(() => {});
      }
    };
    heartbeat();
    const timer = window.setInterval(
      heartbeat,
      SHARED_AGENT_PRESENCE_HEARTBEAT_MS,
    );
    return () => window.clearInterval(timer);
  }, [client, mergedLocalWorking]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void client
        .requestJson<{ presence?: Array<{ taskId: string }> }>(
          "/api/v1/agent-presence",
        )
        .then((payload) => {
          if (cancelled) return;
          const rows = payload.presence ?? [];
          if (rows.length === 0) {
            setRemoteWorkingTaskIds(EMPTY_WORKING_TASK_IDS);
            return;
          }
          setRemoteWorkingTaskIds(new Set(rows.map((row) => row.taskId)));
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, SHARED_AGENT_PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client]);

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
      isTaskAcpSessionBusy: () => false,
      isTaskAgentOpen: (taskId) => openTaskIds.has(taskId),
    }),
    [
      openTaskIds,
      setOpenTaskIds,
      setStatusItemsStable,
      setSummaryStable,
      setTaskResearchWorking,
      setWorkingTaskIds,
      statusItems,
      summary,
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
