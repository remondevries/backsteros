import { startTaskAgentSession } from "@/lib/start-task-agent-session";
import type { TaskAgentSession } from "@/lib/task-agent-sessions";

export type ResumeTaskFromHoldTask = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  projectKey?: string | null;
};

export type ResumeTaskFromHoldResult =
  | { ok: true; session: TaskAgentSession; created: boolean; prompt: string }
  | { ok: false; error: string };

/**
 * Create/reuse a Cursor Agent chat and return the attach payload for a hold
 * reply. The reply body is the next agent prompt.
 */
export async function resumeTaskFromHold(input: {
  task: ResumeTaskFromHoldTask;
  /** User reply on the hold thread — becomes the agent prompt. */
  prompt: string;
}): Promise<ResumeTaskFromHoldResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { ok: false, error: "Reply is required to continue." };
  }

  const result = await startTaskAgentSession(input.task.id);
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    session: result.session,
    created: result.created,
    prompt,
  };
}
