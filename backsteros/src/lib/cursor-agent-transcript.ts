/**
 * Fetch the latest Cursor IDE agent transcript via the local PTY sidecar.
 * Used to mirror this Composer/agent chat into Process → UI (ChatThread) and
 * Process → Terminal (static sync).
 */

import type { ChatUiMessage, ChatUiMessagePart } from "@backsteros/contracts";

import { getPtyAuthToken, getTaskShellHttpOrigin } from "./task-shell-pty";

export type CursorAgentTranscriptPart =
  | { type: "text"; text: string; markdown?: boolean }
  | {
      type: "tool-call";
      id?: string;
      name: string;
      input?: unknown;
      output?: unknown;
      status?: "pending" | "running" | "done" | "error";
    };

export type CursorAgentTranscriptMessage = {
  role: "user" | "assistant";
  parts: CursorAgentTranscriptPart[];
};

export type CursorAgentTranscriptResult = {
  ok: boolean;
  error: string | null;
  conversationId: string | null;
  mtimeMs: number;
  messages: CursorAgentTranscriptMessage[];
};

function ptyAuthHeaders(): HeadersInit {
  const token = getPtyAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toChatUiParts(
  parts: readonly CursorAgentTranscriptPart[],
): ChatUiMessagePart[] {
  const out: ChatUiMessagePart[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      out.push({
        type: "text",
        text: part.text,
        markdown: part.markdown,
      });
      continue;
    }
    if (part.type === "tool-call") {
      out.push({
        type: "tool-call",
        id: part.id,
        name: part.name,
        input: part.input,
        output: part.output,
        status: part.status ?? "done",
      });
    }
  }
  return out;
}

export function cursorTranscriptToChatUiMessages(
  messages: readonly CursorAgentTranscriptMessage[],
  conversationId: string | null,
): ChatUiMessage[] {
  const prefix = conversationId?.trim() || "cursor";
  return messages.map((message, index) => ({
    id: `${prefix}:${index}:${message.role}`,
    role: message.role,
    parts: toChatUiParts(message.parts),
    status: "done" as const,
  }));
}

function getCursorTranscriptHttpOrigin():
  | { ok: true; origin: string }
  | { ok: false; error: string } {
  // Prefer the Vite same-origin proxy in browser/dev — avoids WebKit
  // cross-origin blocks to 127.0.0.1:3101 ("Failed to fetch").
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    return { ok: true, origin: `${window.location.origin}/__pty__` };
  }
  return getTaskShellHttpOrigin();
}

export async function fetchCursorAgentTranscript(options: {
  cwd?: string | null;
  conversationId?: string | null;
}): Promise<CursorAgentTranscriptResult> {
  const originResult = getCursorTranscriptHttpOrigin();
  if (!originResult.ok) {
    return {
      ok: false,
      error: originResult.error,
      conversationId: null,
      mtimeMs: 0,
      messages: [],
    };
  }

  const params = new URLSearchParams();
  if (options.cwd?.trim()) params.set("cwd", options.cwd.trim());
  if (options.conversationId?.trim()) {
    params.set("conversationId", options.conversationId.trim());
  }
  const query = params.toString();
  const url = `${originResult.origin}/cursor/agent-transcript${
    query ? `?${query}` : ""
  }`;

  type TranscriptBody = {
    ok?: boolean;
    error?: string | null;
    conversationId?: string | null;
    mtimeMs?: number;
    messages?: CursorAgentTranscriptMessage[];
  };

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...ptyAuthHeaders(),
      },
    });
    const raw = await response.text();
    let body: TranscriptBody | null = null;
    try {
      body = raw ? (JSON.parse(raw) as TranscriptBody) : null;
    } catch {
      body = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        error:
          body?.error ||
          `Could not load Cursor agent transcript (${response.status}).`,
        conversationId: null,
        mtimeMs: 0,
        messages: [],
      };
    }

    if (!body) {
      return {
        ok: false,
        error:
          "PTY sidecar returned a non-JSON response for /cursor/agent-transcript. Restart `pnpm --filter @backsteros/desktop pty` so it picks up the new route.",
        conversationId: null,
        mtimeMs: 0,
        messages: [],
      };
    }

    if (body.ok === false) {
      return {
        ok: false,
        error: body.error || "No Cursor agent transcript found.",
        conversationId: body.conversationId ?? null,
        mtimeMs: typeof body.mtimeMs === "number" ? body.mtimeMs : 0,
        messages: [],
      };
    }

    const messages = Array.isArray(body.messages)
      ? body.messages.map((message) => {
          const legacyText = (message as { text?: unknown }).text;
          return {
            role:
              message.role === "user"
                ? ("user" as const)
                : ("assistant" as const),
            parts: Array.isArray(message.parts)
              ? message.parts
              : // Backward compat if an old sidecar still returns `{ text }`.
                typeof legacyText === "string"
                ? [
                    {
                      type: "text" as const,
                      text: String(legacyText),
                    },
                  ]
                : [],
          };
        })
      : [];

    return {
      ok: true,
      error: body.error ?? null,
      conversationId: body.conversationId ?? null,
      mtimeMs: typeof body.mtimeMs === "number" ? body.mtimeMs : 0,
      messages,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.trim() : "";
    const offline =
      !message ||
      message === "Failed to fetch" ||
      message === "Load failed" ||
      message === "NetworkError when attempting to fetch resource." ||
      (error instanceof Error && error.name === "NetworkError");
    return {
      ok: false,
      error: offline
        ? "Could not reach local PTY server. Run `pnpm --filter @backsteros/desktop pty`."
        : message || "Could not reach local PTY server for Cursor transcript.",
      conversationId: null,
      mtimeMs: 0,
      messages: [],
    };
  }
}
