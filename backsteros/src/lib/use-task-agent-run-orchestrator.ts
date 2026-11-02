import { useEffect, useRef } from "react";
import type { ChatUiMessage, TaskAgentRun } from "@backsteros/contracts";

import {
  buildRecordGitPrompt,
  ensureTaskAcpSession,
  promptTaskAcpSession,
} from "./task-agent-acp";
import {
  fetchAcpChatTranscript,
  fetchGitHead,
} from "./task-agent-acp-transcript";
import { patchTaskAgentRun } from "./task-agent-runs-api";

const BRIEF_SUMMARY_MAX = 2_500;

function lastAssistantTranscriptText(
  messages: readonly ChatUiMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") continue;
    const text = message.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return null;
}

function truncateForBrief(text: string, max = BRIEF_SUMMARY_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/**
 * Watches the active task agent run and executes local Cursor ACP actions when
 * Grok advances phase to build or record. Grok never calls localhost.
 *
 * After ACP finishes, posts a **Brief thread** user message so the conductor
 * webhook fires (task comments alone do not wake Grok).
 */
export function useTaskAgentRunOrchestrator(options: {
  active: boolean;
  taskId: string;
  cwd: string | null;
  run: TaskAgentRun | null;
  requestJson: <T>(path: string, init?: RequestInit) => Promise<T>;
  onError?: (message: string) => void;
  onRecordHydrated?: (info: {
    headSha: string;
    intent: "pr" | "commit";
  }) => void;
}) {
  const {
    active,
    taskId,
    cwd,
    run,
    requestJson,
    onError,
    onRecordHydrated,
  } = options;
  const lastBuildKeyRef = useRef<string | null>(null);
  const lastRecordKeyRef = useRef<string | null>(null);

  useEffect(() => {
    lastBuildKeyRef.current = null;
    lastRecordKeyRef.current = null;
  }, [taskId]);

  useEffect(() => {
    if (!active || !run || run.status !== "active") {
      return;
    }

    const postActivity = async (body: string) => {
      try {
        await requestJson(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              body,
              activityActor: "agent",
            }),
          },
        );
      } catch {
        /* best-effort activity only */
      }
    };

    /** User message on Brief → conductor webhook (required handoff). */
    const notifyBrief = async (body: string) => {
      const threadId = run.briefThreadId?.trim();
      if (!threadId) return;
      await requestJson(
        `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
    };

    const briefAlreadyHasBuildHandoff = async (): Promise<boolean> => {
      const threadId = run.briefThreadId?.trim();
      if (!threadId) return false;
      try {
        const body = await requestJson<{
          messages?: Array<{ role?: string; body?: string | null }>;
        }>(
          `/api/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
        );
        const marker = `Build turn finished (cycle ${run.cycle}).`;
        return (body.messages ?? []).some(
          (message) =>
            message.role === "user" &&
            (message.body ?? "").includes(marker),
        );
      } catch {
        return false;
      }
    };

    const buildFinishedBriefBody = async (
      sessionId: string | null | undefined,
    ): Promise<string> => {
      const taskPath = `/api/v1/tasks/${taskId}/agent-runs/${run.id}`;
      const lines = [
        `Build turn finished (cycle ${run.cycle}).`,
        "Use these exact URLs (do not invent paths):",
        `GET  ${taskPath}`,
        `GET  /api/v1/tasks/${taskId}/agent-runs/active`,
        `PATCH ${taskPath}`,
        `POST ${taskPath}/checks`,
        `taskAgentRun: id=${run.id} taskId=${taskId} phase=build cycle=${run.cycle}`,
        'Next: POST verify checks, then PATCH {"phase":"verify"}, report in Brief. Then phase=record + recordIntent or phase=brief to loop.',
      ];
      const chatId = sessionId?.trim();
      if (chatId) {
        const transcript = await fetchAcpChatTranscript(chatId);
        const summary = lastAssistantTranscriptText(transcript.messages);
        if (summary) {
          lines.push("", "Builder summary:", truncateForBrief(summary));
        }
      }
      return lines.join("\n");
    };

    const finishBuildHandoff = async (sessionId: string | null) => {
      if (await briefAlreadyHasBuildHandoff()) return;
      const briefBody = await buildFinishedBriefBody(sessionId);
      try {
        await notifyBrief(briefBody);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to notify Brief that build finished";
        onError?.(message);
        await patchTaskAgentRun(requestJson, taskId, run.id, {
          lastError: message,
        }).catch(() => undefined);
        return;
      }
      await postActivity(
        `Build turn finished (cycle ${run.cycle}). Conductor notified via Brief.`,
      );
    };

    const kickBuild = async () => {
      const prompt = run.buildPrompt?.trim();
      if (run.phase !== "build" || !prompt) return;
      const key = `${run.id}:${run.cycle}:build:${prompt}`;
      if (lastBuildKeyRef.current === key) return;
      lastBuildKeyRef.current = key;

      // Session already exists → ACP was kicked earlier (possibly finished).
      // Do not re-prompt; only hand off to the conductor via Brief.
      if (run.builderSessionId?.trim()) {
        await finishBuildHandoff(run.builderSessionId);
        return;
      }

      const ensured = await ensureTaskAcpSession({
        taskId,
        cwd,
        chatId: null,
        forceNew: true,
      });
      if (!ensured.ok || !ensured.sessionId) {
        onError?.(ensured.error || "ACP ensure failed");
        await patchTaskAgentRun(requestJson, taskId, run.id, {
          lastError: ensured.error || "ACP ensure failed",
        }).catch(() => undefined);
        return;
      }

      await patchTaskAgentRun(requestJson, taskId, run.id, {
        builderSessionId: ensured.sessionId,
      }).catch(() => undefined);

      const prompted = await promptTaskAcpSession({
        taskId,
        cwd,
        chatId: ensured.sessionId,
        prompt,
      });
      if (!prompted.ok) {
        onError?.(prompted.error || "ACP prompt failed");
        await patchTaskAgentRun(requestJson, taskId, run.id, {
          lastError: prompted.error || "ACP prompt failed",
        }).catch(() => undefined);
        return;
      }

      await finishBuildHandoff(ensured.sessionId);
    };

    const kickRecord = async () => {
      if (run.phase !== "record") return;
      const intent = run.recordIntent;
      if (intent !== "pr" && intent !== "commit") return;
      const key = `${run.id}:${run.cycle}:record:${intent}:${run.recordNotes ?? ""}`;
      if (lastRecordKeyRef.current === key) return;
      lastRecordKeyRef.current = key;

      const ensured = await ensureTaskAcpSession({
        taskId,
        cwd,
        chatId: run.builderSessionId,
      });
      if (!ensured.ok || !ensured.sessionId) {
        onError?.(ensured.error || "ACP ensure failed for record");
        return;
      }
      if (ensured.sessionId !== run.builderSessionId) {
        await patchTaskAgentRun(requestJson, taskId, run.id, {
          builderSessionId: ensured.sessionId,
        }).catch(() => undefined);
      }

      const prompted = await promptTaskAcpSession({
        taskId,
        cwd,
        chatId: ensured.sessionId,
        prompt: buildRecordGitPrompt(intent, run.recordNotes),
      });
      if (!prompted.ok) {
        onError?.(prompted.error || "ACP record prompt failed");
        return;
      }

      const head = await fetchGitHead(cwd);
      if (head.ok && head.headSha) {
        try {
          await requestJson(
            `/api/v1/tasks/${encodeURIComponent(taskId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                addLinkedCommitShas: [head.headSha],
                activityActor: "agent",
              }),
            },
          );
        } catch {
          /* link is best-effort */
        }
        onRecordHydrated?.({ headSha: head.headSha, intent });
      }

      const headLabel = head.headSha?.slice(0, 7) ?? "unknown";
      const briefBody =
        intent === "pr"
          ? `Record turn finished (open PR). HEAD ${headLabel}. Please review and PATCH phase=done when satisfied, or phase=brief to loop.`
          : `Record turn finished (commit). HEAD ${headLabel}. Please review and PATCH phase=done when satisfied, or phase=brief to loop.`;
      try {
        await notifyBrief(briefBody);
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error.message
            : "Failed to notify Brief that record finished",
        );
      }
      await postActivity(briefBody);
    };

    void kickBuild();
    void kickRecord();
  }, [
    active,
    cwd,
    onError,
    onRecordHydrated,
    requestJson,
    run,
    taskId,
  ]);
}
