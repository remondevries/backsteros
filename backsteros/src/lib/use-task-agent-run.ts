import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnswerChatThreadMessageResult,
  ChatThreadMessage,
  ChatUiMessage,
  CreateTaskAgentRunInput,
  TaskAgentRun,
} from "@backsteros/contracts";
import { chatThreadMessagesToUi } from "@backsteros/ui";

import {
  cloudCoreRequestJson,
  isCloudCoreApiError,
} from "./cloud-core-api";
import {
  fetchActiveTaskAgentRun,
  patchTaskAgentRun,
  startTaskAgentRun,
} from "./task-agent-runs-api";

const POLL_MS = 2_500;

function cloudErrorMessage(err: unknown, fallback: string): string {
  if (isCloudCoreApiError(err)) {
    if (err.status === 401) {
      return "Cloud-core rejected the owner API key. Update BACKSTEROS_API_KEY in ~/.config/backsteros/cli.env (sk_access_…), then restart BacksterOS.";
    }
    const match = err.message.match(/^\d+\s+(\{[\s\S]*\})$/);
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]) as { error?: string };
        if (parsed.error?.trim()) return parsed.error.trim();
      } catch {
        /* keep raw */
      }
    }
    if (err.status === 401 || /unauthorized/i.test(err.message)) {
      return "Cloud-core rejected the owner API key. Update BACKSTEROS_API_KEY in ~/.config/backsteros/cli.env (sk_access_…), then restart BacksterOS.";
    }
    return err.message || fallback;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

/**
 * Factory run + Brief live on **cloud-core** so Grok can reply and PATCH phases
 * via agent.backsteros.com. Desktop only executes local Cursor ACP.
 *
 * Brief is a task-scoped chat thread (`chat_threads.task_id`) — separate from
 * the left-rail shell DM with the same agent.
 */
export function useTaskAgentRun(options: {
  active: boolean;
  taskId: string;
}) {
  const [run, setRun] = useState<TaskAgentRun | null>(null);
  const [briefMessages, setBriefMessages] = useState<ChatUiMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = run?.id ?? null;

  const requestJson = useCallback(
    <T,>(path: string, init?: RequestInit) =>
      cloudCoreRequestJson<T>(path, init),
    [],
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
      setError(cloudErrorMessage(err, "Failed to load agent run"));
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
        setBriefMessages(chatThreadMessagesToUi(body.messages ?? []));
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
        const message = cloudErrorMessage(err, "Failed to start agent run");
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

  const answerBriefMessage = useCallback(
    async (messageId: string, body: unknown) => {
      const threadId = run?.briefThreadId?.trim();
      if (!threadId) throw new Error("Brief thread is not ready");
      await requestJson<AnswerChatThreadMessageResult>(
        `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      await refreshBrief(threadId);
      await refreshRun();
    },
    [refreshBrief, refreshRun, requestJson, run?.briefThreadId],
  );

  const answerBriefChoices = useCallback(
    async (messageId: string, values: readonly string[]) => {
      await answerBriefMessage(messageId, { values: [...values] });
    },
    [answerBriefMessage],
  );

  const answerBriefApproval = useCallback(
    async (
      messageId: string,
      decision: "approved" | "rejected",
      note?: string,
    ) => {
      await answerBriefMessage(messageId, {
        decision,
        ...(note?.trim() ? { note: note.trim() } : {}),
      });
    },
    [answerBriefMessage],
  );

  const answerBriefForm = useCallback(
    async (
      messageId: string,
      values: Record<string, string | number | boolean>,
    ) => {
      await answerBriefMessage(messageId, { values });
    },
    [answerBriefMessage],
  );

  const answerBriefEmailDraft = useCallback(
    async (
      messageId: string,
      emailAction: "send" | "discard",
      edits?: {
        to?: string[];
        cc?: string[];
        bcc?: string[];
        subject?: string;
        body?: string;
        from?: string;
      },
    ) => {
      await answerBriefMessage(messageId, {
        emailAction,
        ...(edits ? { edits } : {}),
      });
    },
    [answerBriefMessage],
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
    answerBriefChoices,
    answerBriefApproval,
    answerBriefForm,
    answerBriefEmailDraft,
    requestJson,
  };
}
