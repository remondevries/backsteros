/** Apply observer-side hold / review after a Cursor agent turn ends. */

import type { BacksterosApiClient } from "@backsteros/api-client";

import { clearLiveAgentWorkingForTask } from "./clear-live-agent-working";
import { evaluateAgentTurnOutcome } from "./agent-hold";
import type { AgentTurnCompletedEvent } from "./agent-turn";
import {
  holdTaskForAgent,
  reviewTaskForAgent,
} from "./agent-task-mutations";

/**
 * Record telemetry + move the task to On Hold or In Review (with comment).
 * Best-effort — never throws into the terminal UX.
 *
 * Successful stops → In Review (+ assistant comment when available).
 * Failed / needs-input / abrupt exits → On Hold.
 */
export async function applyAgentTurnCompleted(
  client: BacksterosApiClient,
  event: AgentTurnCompletedEvent,
  options?: {
    parentCommentId?: string | null;
  },
): Promise<void> {
  try {
    await client.requestJson(
      `/api/v1/tasks/${encodeURIComponent(event.taskId)}/activities`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "agent_worked",
          data: {
            durationMs: event.durationMs,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            cacheReadTokens: event.cacheReadTokens,
            cacheWriteTokens: event.cacheWriteTokens,
            totalTokens: event.totalTokens,
            chatId: event.chatId,
            status: event.status,
          },
        }),
      },
    );
  } catch {
    /* best-effort telemetry */
  }

  const outcome = evaluateAgentTurnOutcome({
    reason: event.reason,
    status: event.status,
    assistantText: event.assistantText,
    abrupt: event.abrupt,
  });
  const parentCommentId = options?.parentCommentId?.trim() || null;

  if (outcome.action === "hold") {
    const held = await holdTaskForAgent(client, event.taskId, outcome.decision, {
      parentCommentId,
    });
    if (held) {
      clearLiveAgentWorkingForTask(event.taskId);
    }
    return;
  }

  await reviewTaskForAgent(client, event.taskId, event.assistantText, {
    parentCommentId,
  });
}
