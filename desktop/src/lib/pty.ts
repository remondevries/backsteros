/**
 * Local PTY sidecar helpers for Settings → Cursor → Agents.
 *
 * Desktop Agent Chat / ACP client calls were removed (BOD-49). The sidecar
 * (`pnpm pty`) still runs for **mobile** Agent Chat over Tailscale — Hub Start
 * keeps it up. This module only lists/kills sessions for ops.
 */

export const DEFAULT_PTY_HTTP_ORIGIN = "http://127.0.0.1:3101";

export type PtySessionKind = "agent" | "shell";

export type PtySessionInfo = {
  sessionId: string;
  kind: PtySessionKind;
  taskId: string | null;
  label: string | null;
  cwd: string | null;
  createdAt: string | null;
  lastActivity: "working" | "idle" | null;
  uiAttached: boolean;
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

export function getPtyHttpOrigin(): string {
  return (
    (import.meta.env.VITE_PTY_HTTP_URL as string | undefined)?.trim() ||
    DEFAULT_PTY_HTTP_ORIGIN
  ).replace(/\/$/, "");
}

/** WebKit (Tauri) surfaces connection refused as opaque "Load failed". */
function ptyUnreachableMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (
      message === "Load failed" ||
      message === "Failed to fetch" ||
      message === "NetworkError when attempting to fetch resource." ||
      error.name === "NetworkError"
    ) {
      return "Could not reach local PTY server. Start it from Hub (or run `pnpm --filter @backsteros/desktop pty`).";
    }
    if (message) return message;
  }
  return "Could not reach local PTY server. Start it from Hub (or run `pnpm --filter @backsteros/desktop pty`).";
}

export async function listPtySessions(options?: {
  kind?: PtySessionKind;
}): Promise<
  | { ok: true; sessions: PtySessionInfo[] }
  | { ok: false; error: string; offline?: boolean }
> {
  try {
    const url = new URL(`${getPtyHttpOrigin()}/sessions`);
    if (options?.kind) url.searchParams.set("kind", options.kind);
    const response = await fetch(url.toString(), {
      headers: ptyAuthHeaders(),
    });
    const body = (await response.json().catch(() => null)) as {
      sessions?: PtySessionInfo[];
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `PTY sessions request failed (${response.status}).`,
      };
    }
    return {
      ok: true,
      sessions: Array.isArray(body?.sessions) ? body.sessions : [],
    };
  } catch (error) {
    return {
      ok: false,
      offline: true,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY server. Run `pnpm --filter @backsteros/desktop pty`.",
    };
  }
}

export async function killPtySession(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = sessionId.trim();
  if (!id) return { ok: false, error: "Missing session id." };
  try {
    const response = await fetch(
      `${getPtyHttpOrigin()}/sessions/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: ptyAuthHeaders() },
    );
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Could not kill session (${response.status}).`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: ptyUnreachableMessage(error),
    };
  }
}
