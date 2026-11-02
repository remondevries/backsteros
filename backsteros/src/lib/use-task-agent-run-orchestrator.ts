import { useEffect, useRef } from "react";
import type { ChatUiMessage, TaskAgentRun } from "@backsteros/contracts";

import {
  buildRecordGitPrompt,
  buildVerifyPrompt,
  ensureTaskAcpSession,
  parseVerifyCheckResults,
  promptTaskAcpSession,
} from "./task-agent-acp";
import {
  fetchAcpChatTranscript,
  fetchGitHead,
} from "./task-agent-acp-transcript";
import {
  patchTaskAgentRun,
  patchTaskAgentRunCheck,
} from "./task-agent-runs-api";

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
 * Grok advances phase to build, verify, or record. Grok never calls localhost.
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
  const lastVerifyKeyRef = useRef<string | null>(null);
  const lastRecordKeyRef = useRef<string | null>(null);

  useEffect(() => {
    lastBuildKeyRef.current = null;
    lastVerifyKeyRef.current = null;
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

    const kickVerify = async () => {
      if (run.phase !== "verify") return;
      const pending = (run.checks ?? []).filter(
        (check) => check.status === "pending" || check.status === "running",
      );
      if (pending.length === 0) return;
      const key = `${run.id}:${run.cycle}:verify:${pending
        .map((check) => check.key)
        .sort()
        .join(",")}`;
      if (lastVerifyKeyRef.current === key) return;
      lastVerifyKeyRef.current = key;

      for (const check of pending) {
        if (check.status === "running") continue;
        await patchTaskAgentRunCheck(
          requestJson,
          taskId,
          run.id,
          check.id,
          { status: "running" },
        ).catch(() => undefined);
      }

      const ensured = await ensureTaskAcpSession({
        taskId,
        cwd,
        chatId: run.builderSessionId,
      });
      if (!ensured.ok || !ensured.sessionId) {
        onError?.(ensured.error || "ACP ensure failed for verify");
        await patchTaskAgentRun(requestJson, taskId, run.id, {
          lastError: ensured.error || "ACP ensure failed for verify",
        }).catch(() => undefined);
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
        prompt: buildVerifyPrompt(
          pending.map((check) => ({
            key: check.key,
            label: check.label,
            detail: check.detail,
          })),
        ),
      });
      if (!prompted.ok) {
        onError?.(prompted.error || "ACP verify prompt failed");
        await patchTaskAgentRun(requestJson, taskId, run.id, {
          lastError: prompted.error || "ACP verify prompt failed",
        }).catch(() => undefined);
        return;
      }

      const transcript = await fetchAcpChatTranscript(ensured.sessionId);
      const summary = lastAssistantTranscriptText(transcript.messages);
      const parsed = summary ? parseVerifyCheckResults(summary) : null;
      const byKey = new Map(
        (parsed ?? []).map((result) => [result.key, result] as const),
      );

      const lines = [
        `Verify turn finished (cycle ${run.cycle}).`,
        `PATCH /api/v1/tasks/${taskId}/agent-runs/${run.id}`,
        `GET  /api/v1/tasks/${taskId}/agent-runs/${run.id}`,
      ];

      if (parsed && parsed.length > 0) {
        for (const check of pending) {
          const result = byKey.get(check.key);
          if (!result) continue;
          await patchTaskAgentRunCheck(
            requestJson,
            taskId,
            run.id,
            check.id,
            {
              status: result.status,
              ...(result.detail ? { detail: result.detail } : {}),
              ...(result.logText ? { logText: result.logText } : {}),
            },
          ).catch(() => undefined);
          lines.push(`- ${check.key}: ${result.status}${result.detail ? ` — ${result.detail}` : ""}`);
        }
        const missing = pending.filter((check) => !byKey.has(check.key));
        if (missing.length > 0) {
          lines.push(
            "",
            `Unchecked keys still pending: ${missing.map((check) => check.key).join(", ")}. Please PATCH those checks or re-run verify.`,
          );
        } else {
          lines.push(
            "",
            'All pending checks updated. If satisfied, PATCH {"phase":"record","recordIntent":"commit"|"pr"} or phase=brief to loop; otherwise keep phase=verify.',
          );
        }
      } else {
        lines.push(
          "",
          "Could not parse a ```checks``` result block from the builder. Summary follows — please PATCH check statuses, then advance phase.",
        );
        if (summary) {
          lines.push("", "Builder summary:", truncateForBrief(summary));
        }
      }

      try {
        await notifyBrief(lines.join("\n"));
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error.message
            : "Failed to notify Brief that verify finished",
        );
      }
      await postActivity(
        `Verify turn finished (cycle ${run.cycle}). Conductor notified via Brief.`,
      );
    };

    void kickBuild();
    void kickVerify();
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
