import { useEffect, useMemo } from "react";

import { useThreadShells } from "~/state/entities";

import { useBacksterosAgentPresenceStore } from "./agentPresenceStore";
import {
  clearBacksterosTaskAgentPresence,
  fetchBacksterosAgentPresence,
  upsertBacksterosTaskAgentPresence,
} from "./client";
import {
  collectBacksterosWorkingTaskIds,
  useBacksterosWorkingTaskIds,
} from "./taskChatWorking";
import { useBacksterosTaskChatStore } from "./taskChatStore";

const EMPTY_WORKING_TASK_IDS: ReadonlySet<string> = new Set();

/** How often T3 refreshes remote presence from BacksterOS core. */
export const BACKSTEROS_AGENT_PRESENCE_POLL_MS = 12_000;
/** How often T3 heartbeats tasks it locally knows are working. */
export const BACKSTEROS_AGENT_PRESENCE_HEARTBEAT_MS = 15_000;

/**
 * Publishes heartbeats for locally working task chats and polls BacksterOS
 * core for live presence (so desktop-started work also shows in T3).
 * Mount once while log mode / BacksterOS UI is active.
 */
export function useSyncBacksterosAgentPresence(enabled: boolean) {
  const byTaskId = useBacksterosTaskChatStore((state) => state.byTaskId);
  const shells = useThreadShells();
  const localWorkingTaskIds = useMemo(
    () => collectBacksterosWorkingTaskIds({ byTaskId, shells }),
    [byTaskId, shells],
  );
  const setRemoteWorkingTaskIds = useBacksterosAgentPresenceStore(
    (state) => state.setRemoteWorkingTaskIds,
  );

  useEffect(() => {
    if (!enabled) return;

    const published = new Set<string>();

    const sync = () => {
      for (const taskId of localWorkingTaskIds) {
        published.add(taskId);
        void upsertBacksterosTaskAgentPresence(taskId, { source: "t3" }).catch(() => {});
      }
      for (const taskId of [...published]) {
        if (localWorkingTaskIds.has(taskId)) continue;
        published.delete(taskId);
        void clearBacksterosTaskAgentPresence(taskId).catch(() => {});
      }
    };

    sync();
    const timer = window.setInterval(sync, BACKSTEROS_AGENT_PRESENCE_HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      for (const taskId of published) {
        void clearBacksterosTaskAgentPresence(taskId).catch(() => {});
      }
    };
  }, [enabled, localWorkingTaskIds]);

  useEffect(() => {
    if (!enabled) {
      setRemoteWorkingTaskIds(EMPTY_WORKING_TASK_IDS);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const refresh = () => {
      void fetchBacksterosAgentPresence({ signal: controller.signal })
        .then((presence) => {
          if (cancelled) return;
          if (presence.length === 0) {
            setRemoteWorkingTaskIds(EMPTY_WORKING_TASK_IDS);
            return;
          }
          setRemoteWorkingTaskIds(new Set(presence.map((row) => row.taskId)));
        })
        .catch(() => {});
    };

    refresh();
    const timer = window.setInterval(refresh, BACKSTEROS_AGENT_PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled, setRemoteWorkingTaskIds]);
}

/** Local T3 chat working ∪ remote BacksterOS presence — for status-icon pulse. */
export function useBacksterosDisplayedWorkingTaskIds(): ReadonlySet<string> {
  const localWorkingTaskIds = useBacksterosWorkingTaskIds();
  const remoteWorkingTaskIds = useBacksterosAgentPresenceStore(
    (state) => state.remoteWorkingTaskIds,
  );
  return useMemo(() => {
    if (localWorkingTaskIds.size === 0 && remoteWorkingTaskIds.size === 0) {
      return EMPTY_WORKING_TASK_IDS;
    }
    const merged = new Set<string>(localWorkingTaskIds);
    for (const taskId of remoteWorkingTaskIds) merged.add(taskId);
    return merged;
  }, [localWorkingTaskIds, remoteWorkingTaskIds]);
}
