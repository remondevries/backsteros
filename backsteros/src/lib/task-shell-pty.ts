/**
 * Desktop-only task Terminal → local PTY sidecar (`pnpm pty`).
 *
 * Never goes through cloud-core or agent API keys. Sessions are minted on
 * loopback (`POST /task-shell/sessions`) with a per-session token.
 */

import { DEFAULT_PTY_HTTP_ORIGIN, getPtyHttpOrigin } from "./pty";

export type TaskShellSession = {
  sessionId: string;
  token: string;
  cwd: string;
  wsUrl: string;
};

function getPtyAuthToken(): string | null {
  return (
    (import.meta.env.VITE_PTY_AUTH_TOKEN as string | undefined)?.trim() || null
  );
}

function ptyAuthHeaders(): HeadersInit {
  const token = getPtyAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Task shell must stay on loopback — refuse Tailscale / remote PTY URLs. */
export function isLocalTaskShellOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

export function getTaskShellHttpOrigin():
  | { ok: true; origin: string }
  | { ok: false; error: string } {
  const origin = getPtyHttpOrigin() || DEFAULT_PTY_HTTP_ORIGIN;
  if (!isLocalTaskShellOrigin(origin)) {
    return {
      ok: false,
      error:
        "Task Terminal is available only on the local desktop PTY (127.0.0.1). It is disabled for cloud / remote cores.",
    };
  }
  return { ok: true, origin };
}

function unreachableMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (
      message === "Load failed" ||
      message === "Failed to fetch" ||
      message === "NetworkError when attempting to fetch resource." ||
      error.name === "NetworkError"
    ) {
      return "Could not reach local PTY server. Run `pnpm --filter @backsteros/desktop pty`.";
    }
    if (message) return message;
  }
  return "Could not reach local PTY server. Run `pnpm --filter @backsteros/desktop pty`.";
}

export async function mintTaskShellSession(options: {
  cwd?: string | null;
  taskId?: string | null;
  cols?: number;
  rows?: number;
}): Promise<
  { ok: true; session: TaskShellSession } | { ok: false; error: string }
> {
  const originResult = getTaskShellHttpOrigin();
  if (!originResult.ok) return originResult;

  try {
    const response = await fetch(`${originResult.origin}/task-shell/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ptyAuthHeaders(),
      },
      body: JSON.stringify({
        cwd: options.cwd?.trim() || undefined,
        taskId: options.taskId?.trim() || undefined,
        cols: options.cols,
        rows: options.rows,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      sessionId?: string;
      token?: string;
      cwd?: string;
      wsUrl?: string;
      error?: string;
      code?: string;
    } | null;

    if (!response.ok) {
      if (body?.code === "task_shell_local_only") {
        return {
          ok: false,
          error:
            "Task Terminal is local-desktop only. It cannot run against cloud-core.",
        };
      }
      return {
        ok: false,
        error: body?.error || `Could not start terminal (${response.status}).`,
      };
    }

    if (
      !body?.sessionId ||
      !body.token ||
      !body.wsUrl ||
      typeof body.cwd !== "string"
    ) {
      return { ok: false, error: "PTY server returned an incomplete session." };
    }

    return {
      ok: true,
      session: {
        sessionId: body.sessionId,
        token: body.token,
        cwd: body.cwd,
        wsUrl: body.wsUrl,
      },
    };
  } catch (error) {
    return { ok: false, error: unreachableMessage(error) };
  }
}
