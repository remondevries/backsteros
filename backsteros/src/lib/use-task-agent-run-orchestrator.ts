import { useEffect, useRef } from "react";
import type { TaskAgentRun } from "@backsteros/contracts";

import {
  buildRecordGitPrompt,
  ensureTaskAcpSession,
  promptTaskAcpSession,
} from "./task-agent-acp";
import { fetchGitHead } from "./task-agent-acp-transcript";
import { patchTaskAgentRun } from "./task-agent-runs-api";

/**
 * Watches the active task agent run and executes local Cursor ACP actions when
 * Grok advances phase to build or record. Grok never calls localhost.
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

    const kickBuild = async () => {
      const prompt = run.buildPrompt?.trim();
      if (run.phase !== "build" || !prompt) return;
      const key = `${run.id}:${run.cycle}:build:${prompt}`;
      if (lastBuildKeyRef.current === key) return;
      lastBuildKeyRef.current = key;

      const ensured = await ensureTaskAcpSession({
        taskId,
        cwd,
        chatId: run.builderSessionId,
        forceNew: !run.builderSessionId,
      });
      if (!ensured.ok || !ensured.sessionId) {
        onError?.(ensured.error || "ACP ensure failed");
        await patchTaskAgentRun(requestJson, taskId, run.id, {
          lastError: ensured.error || "ACP ensure failed",
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
        prompt,
      });
      if (!prompted.ok) {
        onError?.(prompted.error || "ACP prompt failed");
        await patchTaskAgentRun(requestJson, taskId, run.id, {
          lastError: prompted.error || "ACP prompt failed",
        }).catch(() => undefined);
        return;
      }

      await postActivity(
        `Build turn finished (cycle ${run.cycle}). Waiting for conductor to advance phase.`,
      );
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

      await postActivity(
        intent === "pr"
          ? `Record turn finished (open PR). HEAD ${head.headSha?.slice(0, 7) ?? "unknown"}.`
          : `Record turn finished (commit). HEAD ${head.headSha?.slice(0, 7) ?? "unknown"}.`,
      );
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
