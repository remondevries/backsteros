import { useEffect, useMemo, useRef } from "react";

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
import { workingTaskIdsKey } from "./workingTaskIdSet";

const EMPTY_WORKING_TASK_IDS: ReadonlySet<string> = new Set();

/**
 * After we clear presence locally, ignore poll/SSE re-adds until this TTL
 * (covers core DELETE lag + presence TTL). Fresh local working clears it.
 */
const PRESENCE_CLEAR_SUPPRESS_MS = 60_000;
/**
 * Quiet gaps between tools / shell identity churn should not DELETE presence
 * (that made the in-progress pulse stop for a beat then restart — OS-15).
 * Match desktop AGENT_WORKING_IDLE_FALLBACK_MS order of magnitude.
 */
export const BACKSTEROS_AGENT_WORKING_LEAVE_GRACE_MS = 15_000;
const presenceClearSuppressedUntil = new Map<string, number>();

function suppressRemotePresenceReadd(taskId: string): void {
  presenceClearSuppressedUntil.set(taskId, Date.now() + PRESENCE_CLEAR_SUPPRESS_MS);
}

function clearPresenceReaddSuppression(taskId: string): void {
  presenceClearSuppressedUntil.delete(taskId);
}

function isRemotePresenceReaddSuppressed(taskId: string, now = Date.now()): boolean {
  const until = presenceClearSuppressedUntil.get(taskId);
  if (until == null) return false;
  if (until <= now) {
    presenceClearSuppressedUntil.delete(taskId);
    return false;
  }
  return true;
}

function filterSuppressedRemoteWorkingTaskIds(taskIds: ReadonlySet<string>): ReadonlySet<string> {
  if (taskIds.size === 0) return EMPTY_WORKING_TASK_IDS;
  const now = Date.now();
  let changed = false;
  const next = new Set<string>();
  for (const taskId of taskIds) {
    if (isRemotePresenceReaddSuppressed(taskId, now)) {
      changed = true;
      continue;
    }
    next.add(taskId);
  }
  if (!changed) return taskIds;
  return next.size === 0 ? EMPTY_WORKING_TASK_IDS : next;
}

/**
 * Fallback poll when SSE is down. SSE is primary; keep this slow to avoid
 * rewriting the whole task list every few seconds.
 */
export const BACKSTEROS_AGENT_PRESENCE_POLL_MS = 30_000;
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
  suppressRemotePresenceReadd(taskId);
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
      if (isRemotePresenceReaddSuppressed(taskId)) return;
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
  const localWorkingRef = useRef(localWorkingTaskIds);
  localWorkingRef.current = localWorkingTaskIds;
  const localWorkingKey = workingTaskIdsKey(localWorkingTaskIds);
  const setRemoteWorkingTaskIds = useBacksterosAgentPresenceStore(
    (state) => state.setRemoteWorkingTaskIds,
  );
  const syncNowRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;

    const published = new Set<string>();
    /** Skip further PUTs after a definitive "task missing" 404 (avoids console spam). */
    const missingTasks = new Set<string>();
    /** Pending leave-grace clears — cancelled if the task resumes working. */
    const leaveClearTimers = new Map<string, number>();
    let inFlight: Promise<void> | null = null;
    /** Membership changed while a tick was in flight — run again after. */
    let pendingSync = false;

    const heartbeat = async (taskId: string) => {
      if (missingTasks.has(taskId)) return;
      try {
        await upsertBacksterosTaskAgentPresence(taskId, { source: "t3" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("(404)")) {
          missingTasks.add(taskId);
        }
      }
    };

    const cancelLeaveClear = (taskId: string) => {
      const timer = leaveClearTimers.get(taskId);
      if (timer == null) return;
      window.clearTimeout(timer);
      leaveClearTimers.delete(taskId);
    };

    const scheduleLeaveClear = (taskId: string) => {
      if (leaveClearTimers.has(taskId)) return;
      leaveClearTimers.set(
        taskId,
        window.setTimeout(() => {
          leaveClearTimers.delete(taskId);
          if (localWorkingRef.current.has(taskId)) return;
          if (!published.has(taskId)) return;
          published.delete(taskId);
          missingTasks.delete(taskId);
          clearBacksterosDisplayedAgentPresence(taskId);
        }, BACKSTEROS_AGENT_WORKING_LEAVE_GRACE_MS),
      );
    };

    const sync = () => {
      // Serialize ticks so overlapping intervals cannot stampede the API.
      if (inFlight) {
        pendingSync = true;
        return;
      }
      inFlight = (async () => {
        do {
          pendingSync = false;
          const live = localWorkingRef.current;
          for (const taskId of live) {
            if (missingTasks.has(taskId)) continue;
            cancelLeaveClear(taskId);
            clearPresenceReaddSuppression(taskId);
            published.add(taskId);
            await heartbeat(taskId);
          }
          // Keep heartbeating published ids still in leave-grace so TTL/SSE
          // do not drop the pulse during quiet tool gaps.
          for (const taskId of published) {
            if (live.has(taskId)) continue;
            if (!leaveClearTimers.has(taskId)) continue;
            await heartbeat(taskId);
          }
          for (const taskId of [...published]) {
            if (live.has(taskId)) continue;
            scheduleLeaveClear(taskId);
          }
        } while (pendingSync);
      })().finally(() => {
        inFlight = null;
      });
    };

    syncNowRef.current = sync;
    sync();
    const timer = window.setInterval(sync, BACKSTEROS_AGENT_PRESENCE_HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      syncNowRef.current = () => {};
      for (const leaveTimer of leaveClearTimers.values()) {
        window.clearTimeout(leaveTimer);
      }
      leaveClearTimers.clear();
      // Only clear on unmount / disable — never on working-set identity churn.
      for (const taskId of published) {
        clearBacksterosDisplayedAgentPresence(taskId);
      }
    };
  }, [enabled]);

  // Kick an immediate reconcile when membership changes (without tearing down
  // the heartbeat effect — that used to DELETE+PUT and flicker the pulse).
  useEffect(() => {
    if (!enabled) return;
    syncNowRef.current();
  }, [enabled, localWorkingKey]);

  useEffect(() => {
    if (!enabled) {
      setRemoteWorkingTaskIds(EMPTY_WORKING_TASK_IDS);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    let pollTimer: number | null = null;

    const refresh = () => {
      void fetchBacksterosAgentPresence({ signal: controller.signal })
        .then((presence) => {
          if (cancelled) return;
          if (presence.length === 0) {
            setRemoteWorkingTaskIds(EMPTY_WORKING_TASK_IDS);
            return;
          }
          setRemoteWorkingTaskIds(
            filterSuppressedRemoteWorkingTaskIds(new Set(presence.map((row) => row.taskId))),
          );
        })
        .catch(() => {});
    };

    const clearPoll = () => {
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPoll = () => {
      if (pollTimer != null || cancelled) return;
      pollTimer = window.setInterval(refresh, BACKSTEROS_AGENT_PRESENCE_POLL_MS);
    };

    // One snapshot up front; while SSE is live we skip the interval.
    refresh();

    const runEvents = async () => {
      let attempt = 0;
      while (!cancelled && !controller.signal.aborted) {
        try {
          const response = await openBacksterosAgentPresenceEvents(controller.signal);
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Agent presence events stream has no body");
          const decoder = new TextDecoder();
          let buffer = "";
          attempt = 0;
          clearPoll();
          while (!cancelled && !controller.signal.aborted) {
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
          if (cancelled || controller.signal.aborted) return;
        }
        startPoll();
        attempt += 1;
        const delay = Math.min(8_000, 500 * 2 ** Math.min(attempt, 4));
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    };

    void runEvents();
    return () => {
      cancelled = true;
      controller.abort();
      clearPoll();
    };
  }, [enabled, setRemoteWorkingTaskIds]);
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
