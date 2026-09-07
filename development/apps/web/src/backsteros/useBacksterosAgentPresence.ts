import { useEffect, useMemo } from "react";

import { useThreadShells } from "~/state/entities";

import { useBacksterosAgentPresenceStore } from "./agentPresenceStore";
import {
  clearBacksterosTaskAgentPresence,
  fetchBacksterosAgentPresence,
  openBacksterosAgentPresenceEvents,
  upsertBacksterosTaskAgentPresence,
} from "./client";
import { collectBacksterosWorkingTaskIds, useBacksterosWorkingTaskIds } from "./taskChatWorking";
import { useBacksterosTaskChatStore } from "./taskChatStore";

const EMPTY_WORKING_TASK_IDS: ReadonlySet<string> = new Set();

/** How often T3 refreshes remote presence from BacksterOS core (SSE is primary). */
export const BACKSTEROS_AGENT_PRESENCE_POLL_MS = 12_000;
/** How often T3 heartbeats tasks it locally knows are working. */
export const BACKSTEROS_AGENT_PRESENCE_HEARTBEAT_MS = 15_000;

/**
 * Merge local chat working with remote core presence.
 * Exported for focused tests.
 */
export function mergeBacksterosDisplayedWorkingTaskIds(input: {
  readonly localWorkingTaskIds: ReadonlySet<string>;
  readonly remoteWorkingTaskIds: ReadonlySet<string>;
}): ReadonlySet<string> {
  if (input.localWorkingTaskIds.size === 0 && input.remoteWorkingTaskIds.size === 0) {
    return EMPTY_WORKING_TASK_IDS;
  }
  if (input.remoteWorkingTaskIds.size === 0) return input.localWorkingTaskIds;
  if (input.localWorkingTaskIds.size === 0) return input.remoteWorkingTaskIds;
  const merged = new Set<string>(input.localWorkingTaskIds);
  for (const taskId of input.remoteWorkingTaskIds) merged.add(taskId);
  return merged;
}

/**
 * Clear shared presence for a task and drop it from the remote working set
 * immediately so the pulse stops without waiting for the next poll.
 */
export function clearBacksterosDisplayedAgentPresence(taskId: string): void {
  useBacksterosAgentPresenceStore.getState().clearRemoteWorkingTaskId(taskId);
  void clearBacksterosTaskAgentPresence(taskId).catch(() => {});
}

function parseSseChunk(chunk: string, onEvent: (event: string, data: string) => void): void {
  const blocks = chunk.split("\n\n");
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    if (dataLines.length === 0) continue;
    onEvent(event, dataLines.join("\n"));
  }
}

/** Apply one SSE agent.presence frame to the remote working store. Exported for tests. */
export function applyBacksterosAgentPresenceSseData(data: string): void {
  try {
    const parsed = JSON.parse(data) as { taskId?: unknown; live?: unknown };
    const taskId = typeof parsed.taskId === "string" ? parsed.taskId.trim() : "";
    if (!taskId) return;
    if (parsed.live === true) {
      useBacksterosAgentPresenceStore.getState().addRemoteWorkingTaskId(taskId);
      return;
    }
    if (parsed.live === false) {
      useBacksterosAgentPresenceStore.getState().clearRemoteWorkingTaskId(taskId);
    }
  } catch {
    // Ignore malformed frames.
  }
}

async function runBacksterosAgentPresenceEventsLoop(signal: AbortSignal): Promise<void> {
  let attempt = 0;
  while (!signal.aborted) {
    try {
      const response = await openBacksterosAgentPresenceEvents(signal);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Agent presence events stream has no body");
      const decoder = new TextDecoder();
      let buffer = "";
      attempt = 0;
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          parseSseChunk(part, (event, data) => {
            if (event !== "agent.presence") return;
            applyBacksterosAgentPresenceSseData(data);
          });
        }
      }
    } catch {
      if (signal.aborted) return;
      attempt += 1;
      const delay = Math.min(8_000, 500 * 2 ** Math.min(attempt, 4));
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }
}

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
        // Optimistic: stop the pulse now; DELETE may still be in flight.
        clearBacksterosDisplayedAgentPresence(taskId);
      }
    };

    sync();
    const timer = window.setInterval(sync, BACKSTEROS_AGENT_PRESENCE_HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      for (const taskId of published) {
        clearBacksterosDisplayedAgentPresence(taskId);
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

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void runBacksterosAgentPresenceEventsLoop(controller.signal);
    return () => {
      controller.abort();
    };
  }, [enabled]);
}

/** Local T3 chat working ∪ remote BacksterOS presence — for status-icon pulse. */
export function useBacksterosDisplayedWorkingTaskIds(): ReadonlySet<string> {
  const localWorkingTaskIds = useBacksterosWorkingTaskIds();
  const remoteWorkingTaskIds = useBacksterosAgentPresenceStore(
    (state) => state.remoteWorkingTaskIds,
  );
  return useMemo(
    () =>
      mergeBacksterosDisplayedWorkingTaskIds({
        localWorkingTaskIds,
        remoteWorkingTaskIds,
      }),
    [localWorkingTaskIds, remoteWorkingTaskIds],
  );
}
