import {
  ensurePtyAcpSession,
  ensurePtyAgent,
  submitPtyAgentPrompt,
} from "../pty";

export type StartTaskAgentSessionResult =
  | {
      ok: true;
      chatId: string;
      sessionId: string;
      created: boolean;
      herdrStarted: boolean;
    }
  | { ok: false; error: string };

/**
 * Start a task agent: Herdr `agent --resume` (live Terminal) + ACP session id
 * linked as `agentChatId`. Text prompts from Chat go through the Herdr pane
 * when it exists so Terminal shows the same turn; ACP handles image prompts
 * and the no-Herdr fallback.
 */
export async function startTaskAgentSession(options: {
  taskId: string;
  cwd: string;
  prompt?: string | null;
  model?: string | null;
  /** Herdr workspace label (project name). */
  label?: string | null;
  /** Herdr tab label (task display id). */
  tabLabel?: string | null;
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

  const ensured = await ensurePtyAgent({
    taskId,
    chatId: acp.chatId,
    cwd,
    // Terminal attaches for viewing; Chat owns the first turn via ACP.
    prompt: null,
    model: options.model,
    label: options.label,
    tabLabel: options.tabLabel,
  });
  if (!ensured.ok) {
    return { ok: false, error: ensured.error };
  }

  const bootstrap = options.prompt?.trim();
  if (bootstrap) {
    // Fire-and-forget: Start UX should not block on the full agent turn.
    void submitPtyAgentPrompt({
      taskId,
      prompt: bootstrap,
      chatId: acp.chatId,
      cwd,
    }).then((result) => {
      if (!result.ok) {
        console.warn("[agent] bootstrap ACP prompt failed:", result.error);
      }
    });
  }

  return {
    ok: true,
    chatId: acp.chatId,
    sessionId: ensured.sessionId,
    created: acp.created,
    herdrStarted: ensured.started,
  };
}

/** @deprecated Prefer startTaskAgentSession. */
export async function createTaskAgentChat(): Promise<
  | { ok: true; chatId: string; created: boolean }
  | { ok: false; error: string }
> {
  // Without cwd we cannot open ACP — keep a soft error.
  return {
    ok: false,
    error: "Use startTaskAgentSession with a working directory.",
  };
}
