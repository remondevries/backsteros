import {
  ensurePtyAcpSession,
  submitPtyAgentPrompt,
} from "../pty";

export type StartTaskAgentSessionResult =
  | {
      ok: true;
      chatId: string;
      sessionId: string;
      created: boolean;
    }
  | { ok: false; error: string };

/**
 * Start a task agent via Cursor ACP only (T3-style).
 * Chat owns prompts/streaming; no agent TTY pane is created.
 */
export async function startTaskAgentSession(options: {
  taskId: string;
  cwd: string;
  prompt?: string | null;
  model?: string | null;
}): Promise<StartTaskAgentSessionResult> {
  const taskId = options.taskId.trim();
  const cwd = options.cwd.trim();
  if (!taskId) return { ok: false, error: "taskId is required." };
  if (!cwd) {
    return {
      ok: false,
      error: "A working directory is required to start the agent.",
    };
  }

  const acp = await ensurePtyAcpSession({ taskId, cwd });
  if (!acp.ok) {
    return { ok: false, error: acp.error };
  }

  const bootstrap = options.prompt?.trim();
  if (bootstrap) {
    void submitPtyAgentPrompt({
      taskId,
      prompt: bootstrap,
      chatId: acp.chatId,
      cwd,
      model: options.model,
    }).then((result) => {
      if (!result.ok) {
        console.warn("[agent] bootstrap ACP prompt failed:", result.error);
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

/** @deprecated Prefer startTaskAgentSession. */
export async function createTaskAgentChat(): Promise<
  | { ok: true; chatId: string; created: boolean }
  | { ok: false; error: string }
> {
  return {
    ok: false,
    error: "Use startTaskAgentSession with a working directory.",
  };
}
