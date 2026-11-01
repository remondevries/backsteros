import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatThreadMessage,
  ChatUiMessage,
  CreateTaskAgentRunInput,
  TaskAgentRun,
} from "@backsteros/contracts";

import { useDesktopApi } from "./api-context";
import {
  fetchActiveTaskAgentRun,
  patchTaskAgentRun,
  startTaskAgentRun,
} from "./task-agent-runs-api";

const POLL_MS = 2_500;

function chatThreadMessageToUi(message: ChatThreadMessage): ChatUiMessage {
  return {
    id: message.id,
    role:
      message.role === "assistant"
        ? "assistant"
        : message.role === "system"
          ? "system"
          : "user",
    parts: [{ type: "text", text: message.body ?? "" }],
    status: "done",
    createdAt: message.createdAt,
  };
}

export function useTaskAgentRun(options: {
  active: boolean;
  taskId: string;
}) {
  const { client } = useDesktopApi();
  const [run, setRun] = useState<TaskAgentRun | null>(null);
  const [briefMessages, setBriefMessages] = useState<ChatUiMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = run?.id ?? null;

  const requestJson = useCallback(
    <T,>(path: string, init?: RequestInit) => client.requestJson<T>(path, init),
    [client],
  );

  const refreshRun = useCallback(async () => {
    if (!options.taskId.trim()) return null;
    try {
      const activeRun = await fetchActiveTaskAgentRun(
        requestJson,
        options.taskId,
      );
      setRun(activeRun);
      setError(null);
      return activeRun;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent run");
      return null;
    }
  }, [options.taskId, requestJson]);

  const refreshBrief = useCallback(
    async (threadId: string | null | undefined) => {
      const id = threadId?.trim();
      if (!id) {
        setBriefMessages([]);
        return;
      }
      try {
        const body = await requestJson<{ messages: ChatThreadMessage[] }>(
          `/api/v1/chat/threads/${encodeURIComponent(id)}/messages`,
        );
        setBriefMessages(
          (body.messages ?? []).map(chatThreadMessageToUi).filter((m) =>
            m.parts.some(
              (p) => p.type === "text" && p.text.trim().length > 0,
            ),
          ),
        );
      } catch {
        /* keep last brief snapshot */
      }
    },
    [requestJson],
  );

  useEffect(() => {
    if (!options.active || !options.taskId.trim()) return;
    void refreshRun();
  }, [options.active, options.taskId, refreshRun]);

  useEffect(() => {
    if (!options.active || !run?.briefThreadId) return;
    void refreshBrief(run.briefThreadId);
  }, [options.active, refreshBrief, run?.briefThreadId, run?.updatedAt]);

  useEffect(() => {
    if (!options.active || !options.taskId.trim()) return;
    const tick = window.setInterval(() => {
      void refreshRun().then((next) => {
        if (next?.briefThreadId) void refreshBrief(next.briefThreadId);
      });
    }, POLL_MS);
    return () => window.clearInterval(tick);
  }, [options.active, options.taskId, refreshBrief, refreshRun]);

  const startRun = useCallback(
    async (input: CreateTaskAgentRunInput) => {
      setStarting(true);
      setError(null);
      try {
        const created = await startTaskAgentRun(
          requestJson,
          options.taskId,
          input,
        );
        setRun(created);
        if (created.briefThreadId) {
          await refreshBrief(created.briefThreadId);
        }
        return created;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to start agent run";
        setError(message);
        throw err;
      } finally {
        setStarting(false);
      }
    },
    [options.taskId, refreshBrief, requestJson],
  );

  const updateRun = useCallback(
    async (input: Parameters<typeof patchTaskAgentRun>[3]) => {
      const runId = runIdRef.current;
      if (!runId) throw new Error("No active agent run");
      const updated = await patchTaskAgentRun(
        requestJson,
        options.taskId,
        runId,
        input,
      );
      setRun(updated);
      return updated;
    },
    [options.taskId, requestJson],
  );

  const sendBriefMessage = useCallback(
    async (text: string) => {
      const threadId = run?.briefThreadId?.trim();
      if (!threadId) throw new Error("Brief thread is not ready");
      const trimmed = text.trim();
      if (!trimmed) return;
      await requestJson(
        `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        },
      );
      await refreshBrief(threadId);
      await refreshRun();
    },
    [refreshBrief, refreshRun, requestJson, run?.briefThreadId],
  );

  return {
    run,
    briefMessages,
    error,
    starting,
    startRun,
    updateRun,
    refreshRun,
    sendBriefMessage,
    requestJson,
  };
}
