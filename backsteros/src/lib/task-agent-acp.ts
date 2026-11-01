/**
 * Kick a local Cursor ACP session via the PTY sidecar (Mac desktop only).
 */

import { getPtyAuthToken, getTaskShellHttpOrigin } from "./task-shell-pty";

function ptyAuthHeaders(): HeadersInit {
  const token = getPtyAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getAcpHttpOrigin():
  | { ok: true; origin: string }
  | { ok: false; error: string } {
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    return { ok: true, origin: `${window.location.origin}/__pty__` };
  }
  return getTaskShellHttpOrigin();
}

export type EnsureAcpSessionResult = {
  ok: boolean;
  error: string | null;
  sessionId: string | null;
  cwd: string | null;
};

export async function ensureTaskAcpSession(options: {
  taskId: string;
  cwd?: string | null;
  chatId?: string | null;
  forceNew?: boolean;
}): Promise<EnsureAcpSessionResult> {
  const origin = getAcpHttpOrigin();
  if (!origin.ok) {
    return { ok: false, error: origin.error, sessionId: null, cwd: null };
  }
  try {
    const response = await fetch(`${origin.origin}/agent/ensure`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ptyAuthHeaders(),
      },
      body: JSON.stringify({
        taskId: options.taskId,
        cwd: options.cwd?.trim() || undefined,
        chatId: options.chatId?.trim() || undefined,
        forceNew: options.forceNew === true,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      sessionId?: string;
      cwd?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: body.error?.trim() || `ACP ensure failed (${response.status})`,
        sessionId: null,
        cwd: null,
      };
    }
    return {
      ok: true,
      error: null,
      sessionId: body.sessionId?.trim() || null,
      cwd: body.cwd?.trim() || options.cwd?.trim() || null,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY for ACP ensure",
      sessionId: null,
      cwd: null,
    };
  }
}

export type PromptAcpSessionResult = {
  ok: boolean;
  error: string | null;
  sessionId: string | null;
};

export async function promptTaskAcpSession(options: {
  taskId: string;
  prompt: string;
  cwd?: string | null;
  chatId?: string | null;
}): Promise<PromptAcpSessionResult> {
  const origin = getAcpHttpOrigin();
  if (!origin.ok) {
    return { ok: false, error: origin.error, sessionId: null };
  }
  const prompt = options.prompt.trim();
  if (!prompt) {
    return { ok: false, error: "prompt is required", sessionId: null };
  }
  try {
    const response = await fetch(`${origin.origin}/agent/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ptyAuthHeaders(),
      },
      body: JSON.stringify({
        taskId: options.taskId,
        prompt,
        cwd: options.cwd?.trim() || undefined,
        chatId: options.chatId?.trim() || undefined,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      sessionId?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: body.error?.trim() || `ACP prompt failed (${response.status})`,
        sessionId: null,
      };
    }
    return {
      ok: true,
      error: null,
      sessionId: body.sessionId?.trim() || options.chatId?.trim() || null,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY for ACP prompt",
      sessionId: null,
    };
  }
}

export function buildRecordGitPrompt(intent: "pr" | "commit", notes?: string | null): string {
  const note = notes?.trim();
  if (intent === "pr") {
    return [
      "The conductor asked you to open a pull request for this task's changes.",
      "Commit any remaining work on the current branch if needed, push, and open a PR.",
      "Reply with the PR URL and short SHA when done.",
      note ? `Notes from conductor:\n${note}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return [
    "The conductor asked you to commit and push these task changes (no PR).",
    "Create a clear commit on the current branch and push to origin.",
    "Reply with the short SHA when done.",
    note ? `Notes from conductor:\n${note}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
