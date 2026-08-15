import type { AgentPtyConnection } from "@backsteros/contracts";
import * as SecureStore from "expo-secure-store";

type RequestJsonClient = {
  requestJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

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

const SESSION_MAP_KEY = "backsteros.mobile.pty-session-ids-v1";

type SessionMap = Record<string, string>;

async function readSessionMap(): Promise<SessionMap> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: SessionMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) {
        out[key] = value.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function writeSessionMap(map: SessionMap): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore secure store failures */
  }
}

export async function getStoredPtySessionId(
  taskId: string,
): Promise<string | null> {
  const map = await readSessionMap();
  return map[taskId] ?? null;
}

export async function setStoredPtySessionId(
  taskId: string,
  sessionId: string | null,
): Promise<void> {
  const map = await readSessionMap();
  if (!sessionId) {
    delete map[taskId];
  } else {
    map[taskId] = sessionId;
  }
  await writeSessionMap(map);
}

export type AgentPtyConnectionResult =
  | { ok: true; connection: AgentPtyConnection }
  | { ok: false; error: string; unavailable?: boolean };

export async function fetchAgentPtyConnection(
  client: RequestJsonClient,
): Promise<AgentPtyConnectionResult> {
  try {
    const connection = await client.requestJson<AgentPtyConnection>(
      "/api/v1/agent-pty/connection",
    );
    if (!connection?.httpOrigin || !connection.wsUrl || !connection.token) {
      return {
        ok: false,
        unavailable: true,
        error: "Agent terminal connection response was incomplete.",
      };
    }
    return { ok: true, connection };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agent terminal unavailable.";
    const unavailable =
      /503|unavailable|AGENT_PTY/i.test(message) ||
      message.toLowerCase().includes("agent terminal");
    const network =
      /network request failed|failed to fetch|could not connect/i.test(message);
    return {
      ok: false,
      error: network
        ? `${message} — could not reach core API (is \`pnpm --filter @backsteros/server dev\` running on the laptop?).`
        : message,
      unavailable,
    };
  }
}

function ptyAuthHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export function buildPtyWebSocketUrl(
  connection: AgentPtyConnection,
  options: {
    cols?: number;
    rows?: number;
    cwd?: string | null;
    sessionId?: string | null;
    kind?: PtySessionKind | null;
    taskId?: string | null;
    label?: string | null;
    tabLabel?: string | null;
    chatId?: string | null;
  },
): string {
  const url = new URL(connection.wsUrl);
  if (options.cols) url.searchParams.set("cols", String(options.cols));
  if (options.rows) url.searchParams.set("rows", String(options.rows));
  if (options.cwd) url.searchParams.set("cwd", options.cwd);
  if (options.sessionId) url.searchParams.set("sessionId", options.sessionId);
  if (options.kind) url.searchParams.set("kind", options.kind);
  if (options.taskId) url.searchParams.set("taskId", options.taskId);
  if (options.label) url.searchParams.set("label", options.label);
  if (options.tabLabel) url.searchParams.set("tabLabel", options.tabLabel);
  if (options.chatId) url.searchParams.set("chatId", options.chatId);
  url.searchParams.set("token", connection.token);
  return url.toString();
}

export async function createCursorAgentChat(
  connection: AgentPtyConnection,
): Promise<{ ok: true; chatId: string } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${connection.httpOrigin}/agent/create-chat`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(connection.token),
        Accept: "application/json",
      },
    });
    const body = (await response.json().catch(() => null)) as {
      chatId?: string;
      error?: string;
      detail?: string | null;
    } | null;
    if (!response.ok || !body?.chatId) {
      const detail = body?.detail?.trim();
      return {
        ok: false,
        error:
          [body?.error, detail].filter(Boolean).join(" — ") ||
          "Could not create agent session. Is `pnpm --filter @backsteros/desktop pty` reachable over Tailscale?",
      };
    }
    return { ok: true, chatId: body.chatId.toLowerCase() };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not reach PTY server over Tailscale.";
    return {
      ok: false,
      error: /network request failed|failed to fetch|could not connect/i.test(
        message,
      )
        ? `${message} — PTY at ${connection.httpOrigin} unreachable. On the laptop run: pnpm --filter @backsteros/desktop pty:tailscale`
        : message,
    };
  }
}

export type CursorAgentModelOption = {
  id: string;
  displayName: string;
};

/** List Cursor Agent models via the laptop PTY sidecar (`agent --list-models`). */
export async function listCursorAgentModels(
  connection: AgentPtyConnection,
): Promise<
  | { ok: true; models: CursorAgentModelOption[] }
  | { ok: false; error: string }
> {
  try {
    const response = await fetch(`${connection.httpOrigin}/agent/models`, {
      headers: {
        ...ptyAuthHeaders(connection.token),
        Accept: "application/json",
      },
    });
    const body = (await response.json().catch(() => null)) as {
      models?: { id?: string; displayName?: string }[];
      error?: string;
    } | null;
    if (!response.ok || !Array.isArray(body?.models)) {
      return {
        ok: false,
        error: body?.error || "Could not list agent models.",
      };
    }
    const models = body.models
      .map((entry) => {
        const id = entry.id?.trim();
        if (!id) return null;
        return {
          id,
          displayName: entry.displayName?.trim() || id,
        };
      })
      .filter((entry): entry is CursorAgentModelOption => Boolean(entry));
    if (!models.some((m) => m.id === "auto")) {
      models.unshift({ id: "auto", displayName: "Auto" });
    }
    return { ok: true, models };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not reach PTY server over Tailscale.";
    return { ok: false, error: message };
  }
}

export async function listPtySessions(
  connection: AgentPtyConnection,
  options?: { kind?: PtySessionKind },
): Promise<
  | { ok: true; sessions: PtySessionInfo[] }
  | { ok: false; error: string; offline?: boolean }
> {
  try {
    const url = new URL(`${connection.httpOrigin}/sessions`);
    if (options?.kind) url.searchParams.set("kind", options.kind);
    const response = await fetch(url.toString(), {
      headers: ptyAuthHeaders(connection.token),
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
    const message =
      error instanceof Error
        ? error.message
        : "Could not reach PTY server over Tailscale.";
    return {
      ok: false,
      offline: true,
      error: /network request failed|failed to fetch|could not connect/i.test(
        message,
      )
        ? `${message} — PTY at ${connection.httpOrigin} unreachable. On the laptop run: pnpm --filter @backsteros/desktop pty:tailscale`
        : message,
    };
  }
}

export async function findPtySessionForTask(
  connection: AgentPtyConnection,
  taskId: string,
): Promise<string | null> {
  const listed = await listPtySessions(connection, { kind: "agent" });
  if (listed.ok) {
    const matches = listed.sessions.filter((s) => s.taskId === taskId);
    if (matches.length > 0) {
      matches.sort((a, b) => {
        if (a.uiAttached !== b.uiAttached) return a.uiAttached ? -1 : 1;
        return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
      });
      const chosen = matches[0]!.sessionId;
      await setStoredPtySessionId(taskId, chosen);
      return chosen;
    }
    const stored = await getStoredPtySessionId(taskId);
    if (stored && listed.sessions.some((s) => s.sessionId === stored)) {
      return stored;
    }
    // Local id is stale (not on server) — drop it so we don't fight task affinity.
    if (stored) await setStoredPtySessionId(taskId, null);
    return null;
  }
  return getStoredPtySessionId(taskId);
}

export type AgentChatTranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
};

function parseTranscriptMessages(
  raw: unknown,
): AgentChatTranscriptMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentChatTranscriptMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const role = (entry as { role?: unknown }).role;
    const text = (entry as { text?: unknown }).text;
    const id = (entry as { id?: unknown }).id;
    const createdAt = (entry as { createdAt?: unknown }).createdAt;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string" || !text.trim()) continue;
    out.push({
      id:
        typeof id === "string" && id.trim()
          ? id.trim()
          : `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      text: text.trim(),
      createdAt:
        typeof createdAt === "number" && Number.isFinite(createdAt)
          ? createdAt
          : Date.now(),
    });
  }
  return out;
}

/** Shared Chat-tab history on the laptop sidecar (desktop + iPad). */
export async function fetchAgentChatTranscript(
  connection: AgentPtyConnection,
  chatId: string,
): Promise<
  | { ok: true; messages: AgentChatTranscriptMessage[] }
  | { ok: false; error: string }
> {
  const id = chatId.trim().toLowerCase();
  if (!id) return { ok: false, error: "chatId is required." };
  try {
    const response = await fetch(
      `${connection.httpOrigin}/agent/chats/${encodeURIComponent(id)}/transcript`,
      {
        headers: {
          ...ptyAuthHeaders(connection.token),
          Accept: "application/json",
        },
      },
    );
    const body = (await response.json().catch(() => null)) as {
      messages?: unknown;
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Transcript fetch failed (${response.status}).`,
      };
    }
    return { ok: true, messages: parseTranscriptMessages(body?.messages) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach PTY server over Tailscale.",
    };
  }
}

export async function putAgentChatTranscript(
  connection: AgentPtyConnection,
  chatId: string,
  messages: readonly AgentChatTranscriptMessage[],
): Promise<
  | { ok: true; messages: AgentChatTranscriptMessage[] }
  | { ok: false; error: string }
> {
  const id = chatId.trim().toLowerCase();
  if (!id) return { ok: false, error: "chatId is required." };
  try {
    const response = await fetch(
      `${connection.httpOrigin}/agent/chats/${encodeURIComponent(id)}/transcript`,
      {
        method: "PUT",
        headers: {
          ...ptyAuthHeaders(connection.token),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      messages?: unknown;
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Transcript save failed (${response.status}).`,
      };
    }
    return { ok: true, messages: parseTranscriptMessages(body?.messages) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach PTY server over Tailscale.",
    };
  }
}

export async function appendAgentChatTranscriptMessage(
  connection: AgentPtyConnection,
  chatId: string,
  message: AgentChatTranscriptMessage,
): Promise<
  | { ok: true; messages: AgentChatTranscriptMessage[]; appended: boolean }
  | { ok: false; error: string }
> {
  const id = chatId.trim().toLowerCase();
  if (!id) return { ok: false, error: "chatId is required." };
  try {
    const response = await fetch(
      `${connection.httpOrigin}/agent/chats/${encodeURIComponent(id)}/transcript`,
      {
        method: "POST",
        headers: {
          ...ptyAuthHeaders(connection.token),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      messages?: unknown;
      appended?: boolean;
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Transcript append failed (${response.status}).`,
      };
    }
    return {
      ok: true,
      appended: body?.appended === true,
      messages: parseTranscriptMessages(body?.messages),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach PTY server over Tailscale.",
    };
  }
}

/**
 * Submit a follow-up prompt via Cursor ACP on the laptop sidecar.
 */
export async function submitPtyAgentPrompt(
  connection: AgentPtyConnection,
  options: {
    taskId: string;
    prompt: string;
    chatId?: string | null;
    cwd?: string | null;
    clear?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const taskId = options.taskId.trim();
  const prompt = options.prompt.trim();
  if (!taskId || !prompt) {
    return { ok: false, error: "taskId and prompt are required." };
  }
  try {
    const response = await fetch(`${connection.httpOrigin}/agent/prompt`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(connection.token),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId,
        prompt,
        chatId: options.chatId?.trim() || null,
        cwd: options.cwd?.trim() || null,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `Agent prompt failed (${response.status}).`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach PTY server over Tailscale.",
    };
  }
}

/** Ensure a Cursor ACP session for Chat. */
export async function ensurePtyAcpSession(
  connection: AgentPtyConnection,
  options: {
    taskId: string;
    cwd: string;
    sessionId?: string | null;
    chatId?: string | null;
  },
): Promise<
  | {
      ok: true;
      sessionId: string;
      chatId: string;
      created: boolean;
      resumed: boolean;
    }
  | { ok: false; error: string }
> {
  const taskId = options.taskId.trim();
  const cwd = options.cwd.trim();
  if (!taskId || !cwd) {
    return { ok: false, error: "taskId and cwd are required." };
  }
  try {
    const response = await fetch(`${connection.httpOrigin}/agent/acp/ensure`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(connection.token),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId,
        cwd,
        sessionId: options.sessionId?.trim() || options.chatId?.trim() || null,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      sessionId?: string;
      chatId?: string;
      created?: boolean;
      resumed?: boolean;
      error?: string;
    } | null;
    const sessionId = body?.sessionId?.trim().toLowerCase();
    if (!response.ok || !sessionId) {
      return {
        ok: false,
        error: body?.error || `ACP ensure failed (${response.status}).`,
      };
    }
    return {
      ok: true,
      sessionId,
      chatId: (body?.chatId || sessionId).toLowerCase(),
      created: body?.created === true,
      resumed: body?.resumed === true,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach PTY server over Tailscale.",
    };
  }
}

export async function cancelPtyAcpTurn(
  connection: AgentPtyConnection,
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = taskId.trim();
  if (!id) return { ok: false, error: "taskId is required." };
  try {
    const response = await fetch(`${connection.httpOrigin}/agent/acp/cancel`, {
      method: "POST",
      headers: {
        ...ptyAuthHeaders(connection.token),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskId: id }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: body?.error || `ACP cancel failed (${response.status}).`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach PTY server over Tailscale.",
    };
  }
}

export async function killPtySession(
  connection: AgentPtyConnection,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = sessionId.trim();
  if (!id) return { ok: false, error: "Missing session id." };
  try {
    const response = await fetch(
      `${connection.httpOrigin}/sessions/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: ptyAuthHeaders(connection.token) },
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
    const message =
      error instanceof Error
        ? error.message
        : "Could not reach PTY server over Tailscale.";
    return {
      ok: false,
      error: /network request failed|failed to fetch|could not connect/i.test(
        message,
      )
        ? `${message} — PTY at ${connection.httpOrigin} unreachable. On the laptop run: pnpm --filter @backsteros/desktop pty:tailscale`
        : message,
    };
  }
}

export function newPtySessionId(): string {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
