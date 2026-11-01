/**
 * Load Cursor ACP chat transcript for a factory builder session
 * (`GET /agent/chats/:chatId/transcript` on the PTY sidecar).
 */

import type { ChatUiMessage } from "@backsteros/contracts";

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

type AcpStoredMessage = {
  id?: string;
  role?: string;
  text?: string;
  createdAt?: number;
};

export type AcpChatTranscriptResult = {
  ok: boolean;
  error: string | null;
  messages: ChatUiMessage[];
};

export async function fetchAcpChatTranscript(
  chatId: string,
): Promise<AcpChatTranscriptResult> {
  const id = chatId.trim();
  if (!id) {
    return { ok: false, error: "chatId is required", messages: [] };
  }
  const origin = getAcpHttpOrigin();
  if (!origin.ok) {
    return { ok: false, error: origin.error, messages: [] };
  }
  try {
    const response = await fetch(
      `${origin.origin}/agent/chats/${encodeURIComponent(id)}/transcript`,
      {
        method: "GET",
        headers: { ...ptyAuthHeaders() },
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      messages?: AcpStoredMessage[];
    };
    if (!response.ok) {
      return {
        ok: false,
        error:
          body.error?.trim() ||
          `ACP transcript failed (${response.status})`,
        messages: [],
      };
    }
    const raw = Array.isArray(body.messages) ? body.messages : [];
    const messages: ChatUiMessage[] = [];
    for (let index = 0; index < raw.length; index += 1) {
      const message = raw[index]!;
      const text =
        typeof message.text === "string" ? message.text.trim() : "";
      if (!text) continue;
      const role =
        message.role === "user"
          ? ("user" as const)
          : message.role === "system"
            ? ("system" as const)
            : ("assistant" as const);
      messages.push({
        id: message.id?.trim() || `acp:${id}:${index}`,
        role,
        parts: [{ type: "text", text }],
        status: "done",
        createdAt:
          typeof message.createdAt === "number"
            ? new Date(message.createdAt).toISOString()
            : undefined,
      });
    }
    return { ok: true, error: null, messages };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY for ACP transcript",
      messages: [],
    };
  }
}

export type GitHeadResult = {
  ok: boolean;
  error: string | null;
  headSha: string | null;
};

export async function fetchGitHead(cwd: string | null): Promise<GitHeadResult> {
  const origin = getAcpHttpOrigin();
  if (!origin.ok) {
    return { ok: false, error: origin.error, headSha: null };
  }
  try {
    const response = await fetch(`${origin.origin}/agent/git/head`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ptyAuthHeaders(),
      },
      body: JSON.stringify({ cwd: cwd?.trim() || undefined }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      headSha?: string | null;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: body.error?.trim() || `git head failed (${response.status})`,
        headSha: null,
      };
    }
    const sha =
      typeof body.headSha === "string" && body.headSha.trim()
        ? body.headSha.trim()
        : null;
    return { ok: true, error: null, headSha: sha };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach local PTY for git HEAD",
      headSha: null,
    };
  }
}
