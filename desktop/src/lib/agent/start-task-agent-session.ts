import {
  ensurePtyAcpSession,
  submitPtyAgentPrompt,
} from "../pty";

/** t3 IMAGE_ONLY_BOOTSTRAP_PROMPT — Cursor ACP needs a non-empty text block. */
export const IMAGE_ONLY_BOOTSTRAP_PROMPT = "Please review the attached image(s).";

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
  /** UI mode (build/ask/plan) or Cursor mode id — applied before bootstrap prompt. */
  mode?: string | null;
  images?: { mimeType: string; data: string }[] | null;
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

  const images = (options.images ?? []).filter(
    (image) =>
      image.mimeType.startsWith("image/") && image.data.trim().length > 0,
  );
  const bootstrap =
    options.prompt?.trim() ||
    (images.length > 0 ? IMAGE_ONLY_BOOTSTRAP_PROMPT : "");
  if (bootstrap) {
    void submitPtyAgentPrompt({
      taskId,
      prompt: bootstrap,
      chatId: acp.chatId,
      cwd,
      model: options.model,
      mode: options.mode,
      images,
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
