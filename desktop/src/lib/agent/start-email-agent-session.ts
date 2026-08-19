import {
  ensurePtyAcpSession,
  submitPtyAgentPrompt,
} from "../pty";

export type StartEmailAgentSessionResult =
  | {
      ok: true;
      chatId: string;
      sessionId: string;
      created: boolean;
    }
  | { ok: false; error: string };

/**
 * Start an email-scoped agent session (ACP only). Uses `email:{inbox}:{message}`
 * as the PTY task id; cwd is always home.
 */
export async function startEmailAgentSession(options: {
  taskId: string;
  prompt?: string | null;
  model?: string | null;
  mode?: string | null;
}): Promise<StartEmailAgentSessionResult> {
  const taskId = options.taskId.trim();
  if (!taskId) return { ok: false, error: "taskId is required." };

  const acp = await ensurePtyAcpSession({ taskId, cwd: "~" });
  if (!acp.ok) {
    return { ok: false, error: acp.error };
  }

  const bootstrap = options.prompt?.trim() ?? "";
  if (bootstrap) {
    void submitPtyAgentPrompt({
      taskId,
      prompt: bootstrap,
      chatId: acp.chatId,
      cwd: "~",
      model: options.model,
      mode: options.mode,
    }).then((result) => {
      if (!result.ok) {
        console.warn("[email-agent] bootstrap ACP prompt failed:", result.error);
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
