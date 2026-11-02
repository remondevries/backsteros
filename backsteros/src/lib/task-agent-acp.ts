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

export type VerifyCheckSpec = {
  key: string;
  label: string;
  detail?: string | null;
};

export type ParsedVerifyCheckResult = {
  key: string;
  status: "pass" | "fail" | "skipped";
  detail?: string;
  logText?: string;
};

/** Prompt Cursor ACP to execute pending factory Verify checks locally. */
export function buildVerifyPrompt(checks: readonly VerifyCheckSpec[]): string {
  const list = checks
    .map((check, index) => {
      const detail = check.detail?.trim();
      return `${index + 1}. key=${check.key} — ${check.label}${detail ? ` (${detail})` : ""}`;
    })
    .join("\n");
  return [
    "You are verifying a BacksterOS task agent factory Build on this machine.",
    "Execute every pending check below. For typecheck/lint keys, run the real commands from the repo root (pnpm typecheck / pnpm lint, scoped to touched packages when appropriate).",
    "For UI/code-review checks, inspect the code and decide pass or fail with a short reason.",
    "",
    "Pending checks:",
    list || "(none)",
    "",
    "When finished, end your reply with exactly one fenced block in this form (no extra commentary inside the fence):",
    "```checks",
    '[{"key":"typecheck","status":"pass","detail":"ok","logText":"..."},{"key":"lint","status":"fail","detail":"...","logText":"..."}]',
    "```",
    'status must be one of: "pass", "fail", "skipped". Include every pending key once.',
  ].join("\n");
}

/**
 * Parse the trailing ```checks … ``` JSON array from an ACP assistant reply.
 */
export function parseVerifyCheckResults(
  transcriptText: string,
): ParsedVerifyCheckResult[] | null {
  const text = transcriptText.trim();
  if (!text) return null;
  const fenced =
    /```checks\s*([\s\S]*?)```/i.exec(text) ??
    /```json\s*([\s\S]*?)```/i.exec(text);
  const raw = (fenced?.[1] ?? "").trim() || extractTrailingJsonArray(text);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: ParsedVerifyCheckResult[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key.trim() : "";
    const statusRaw =
      typeof record.status === "string" ? record.status.trim().toLowerCase() : "";
    if (!key) continue;
    if (statusRaw !== "pass" && statusRaw !== "fail" && statusRaw !== "skipped") {
      continue;
    }
    const detail =
      typeof record.detail === "string" ? record.detail.trim() : undefined;
    const logText =
      typeof record.logText === "string"
        ? record.logText
        : typeof record.log === "string"
          ? record.log
          : undefined;
    out.push({
      key,
      status: statusRaw,
      ...(detail ? { detail } : {}),
      ...(logText ? { logText } : {}),
    });
  }
  return out.length > 0 ? out : null;
}

function extractTrailingJsonArray(text: string): string | null {
  const start = text.lastIndexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1).trim();
}
