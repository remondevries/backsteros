import {
  clearTaskAgentSessionsForTask,
  createTaskAgentSession,
  listTaskAgentSessions,
  readTaskAgentSessions,
  upsertTaskAgentSession,
  writeTaskAgentSessions,
  type TaskAgentSession,
} from "@/lib/task-agent-sessions";

export type StartTaskAgentSessionResult =
  | { ok: true; session: TaskAgentSession; created: boolean }
  | { ok: false; error: string };

export type StartTaskAgentSessionOptions = {
  /**
   * Always create a fresh Cursor chat and replace any leftover binding.
   * Use for Start working after destroy — never revive a wiped session.
   */
  forceNew?: boolean;
};

/**
 * Create (or reuse) a task-bound Cursor Agent chat and persist the binding.
 * Callers attach/resume in the terminal via `onAttachAgentSession`.
 */
export async function startTaskAgentSession(
  taskId: string,
  options?: StartTaskAgentSessionOptions,
): Promise<StartTaskAgentSessionResult> {
  if (options?.forceNew) {
    writeTaskAgentSessions(
      clearTaskAgentSessionsForTask(readTaskAgentSessions(), taskId),
    );
  } else {
    const existing = listTaskAgentSessions(readTaskAgentSessions(), taskId);
    if (existing[0]) {
      return { ok: true, session: existing[0], created: false };
    }
  }

  try {
    const response = await fetch("/api/agent/create-chat", {
      method: "POST",
    });
    const body = (await response.json().catch(() => null)) as {
      chatId?: string;
      error?: string;
    } | null;
    if (!response.ok || !body?.chatId) {
      return {
        ok: false,
        error: body?.error || "Could not create agent session.",
      };
    }
    const session = createTaskAgentSession({
      taskId,
      chatId: body.chatId,
    });
    writeTaskAgentSessions(
      upsertTaskAgentSession(readTaskAgentSessions(), session),
    );
    return { ok: true, session, created: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not create agent session.",
    };
  }
}
