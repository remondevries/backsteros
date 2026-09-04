import type { AgentPtyConnection } from "@backsteros/contracts";

import {
  ensurePtyAcpSession,
  submitPtyAgentPrompt,
} from "./agent-pty";

export type StartEmailAgentSessionResult =
  | {
      ok: true;
      chatId: string;
      sessionId: string;
      created: boolean;
    }
  | { ok: false; error: string };

/**
 * Start an email-scoped ACP session on the laptop PTY sidecar.
 * Uses `email:compose` / `email:{inbox}:{message}` as the PTY task id; cwd is home.
 */
export async function startEmailAgentSession(
  connection: AgentPtyConnection,
  options: {
    taskId: string;
    prompt?: string | null;
  },
): Promise<StartEmailAgentSessionResult> {
  const taskId = options.taskId.trim();
  if (!taskId) return { ok: false, error: "taskId is required." };

  const acp = await ensurePtyAcpSession(connection, {
    taskId,
    cwd: "~",
  });
  if (!acp.ok) {
    return { ok: false, error: acp.error };
  }

  const bootstrap = options.prompt?.trim() ?? "";
  if (bootstrap) {
    void submitPtyAgentPrompt(connection, {
      taskId,
      prompt: bootstrap,
      chatId: acp.chatId,
      cwd: "~",
    }).then((result) => {
      if (!result.ok) {
        console.warn(
          "[email-agent] bootstrap ACP prompt failed:",
          result.error,
        );
      }
    });
  }

  return {
    ok: true,
    chatId: acp.chatId,
    sessionId: acp.sessionId,
    created: acp.created,
  };
}
