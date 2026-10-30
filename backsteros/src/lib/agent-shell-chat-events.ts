/**
 * Authenticated SSE subscriber for shell agent DM replies on cloud-core.
 * Goes through the agents door / Vite `__cloud_core__` proxy.
 */

import {
  cloudCoreRequestStream,
  isCloudCoreApiError,
} from "./cloud-core-api";

export const AGENT_SHELL_CHAT_SSE_EVENT = "agent.chat.message" as const;
export const AGENT_SHELL_CHAT_STATUS_SSE_EVENT = "agent.chat.status" as const;

/** Window event so ChatUiDevPreview can drive the thinking indicator. */
export const AGENT_SHELL_CHAT_STATUS_WINDOW_EVENT =
  "backsteros:agent-shell-chat-status";

/** Window event so the open thread can refetch when an assistant reply lands. */
export const AGENT_SHELL_CHAT_MESSAGE_WINDOW_EVENT =
  "backsteros:agent-shell-chat-message";

export type AgentShellChatMessagePayload = {
  threadId: string;
  agentId: string;
  message: {
    id: string;
    body: string;
    createdAt: string;
  };
};

export type AgentShellChatStatusPayload = {
  threadId: string;
  agentId: string;
  state: "working" | "idle";
  at: string;
  pendingReplyAt: string | null;
};

export function dispatchAgentShellChatStatus(
  payload: AgentShellChatStatusPayload,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AGENT_SHELL_CHAT_STATUS_WINDOW_EVENT, {
      detail: payload,
    }),
  );
}

export function dispatchAgentShellChatMessage(
  payload: AgentShellChatMessagePayload,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AGENT_SHELL_CHAT_MESSAGE_WINDOW_EVENT, {
      detail: payload,
    }),
  );
}

function parseSseChunk(
  chunk: string,
  onEvent: (event: string, data: string) => void,
): void {
  const blocks = chunk.split("\n\n");
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    if (dataLines.length === 0) continue;
    onEvent(event, dataLines.join("\n"));
  }
}

export function parseAgentShellChatMessagePayload(
  data: string,
): AgentShellChatMessagePayload | null {
  try {
    const parsed = JSON.parse(data) as {
      threadId?: unknown;
      agentId?: unknown;
      message?: {
        id?: unknown;
        body?: unknown;
        createdAt?: unknown;
      };
    };
    const threadId =
      typeof parsed.threadId === "string" ? parsed.threadId.trim() : "";
    const agentId =
      typeof parsed.agentId === "string" ? parsed.agentId.trim() : "";
    const messageId =
      typeof parsed.message?.id === "string" ? parsed.message.id.trim() : "";
    const body =
      typeof parsed.message?.body === "string" ? parsed.message.body : "";
    const createdAt =
      typeof parsed.message?.createdAt === "string"
        ? parsed.message.createdAt.trim()
        : "";
    if (!threadId || !agentId || !messageId || !createdAt) return null;
    return {
      threadId,
      agentId,
      message: { id: messageId, body, createdAt },
    };
  } catch {
    return null;
  }
}

export function parseAgentShellChatStatusPayload(
  data: string,
): AgentShellChatStatusPayload | null {
  try {
    const parsed = JSON.parse(data) as {
      threadId?: unknown;
      agentId?: unknown;
      state?: unknown;
      at?: unknown;
      pendingReplyAt?: unknown;
    };
    const threadId =
      typeof parsed.threadId === "string" ? parsed.threadId.trim() : "";
    const agentId =
      typeof parsed.agentId === "string" ? parsed.agentId.trim() : "";
    const state =
      parsed.state === "working" || parsed.state === "idle" ? parsed.state : null;
    const at = typeof parsed.at === "string" ? parsed.at.trim() : "";
    const pendingReplyAt =
      parsed.pendingReplyAt == null
        ? null
        : typeof parsed.pendingReplyAt === "string"
          ? parsed.pendingReplyAt.trim() || null
          : null;
    if (!threadId || !agentId || !state || !at) return null;
    return { threadId, agentId, state, at, pendingReplyAt };
  } catch {
    return null;
  }
}

export async function subscribeAgentShellChatEvents(input: {
  signal: AbortSignal;
  onMessage: (payload: AgentShellChatMessagePayload) => void;
  onStatus?: (payload: AgentShellChatStatusPayload) => void;
  onConnection?: (status: "live") => void;
  requestStream?: (
    path: string,
    init?: RequestInit,
  ) => Promise<Response>;
}): Promise<void> {
  const requestStream = input.requestStream ?? cloudCoreRequestStream;
  const response = await requestStream("/api/v1/chat/threads/events", {
    method: "GET",
    signal: input.signal,
  });
  if (!response.ok) {
    throw new Error(`Agent shell chat events failed (${response.status})`);
  }
  input.onConnection?.("live");
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Agent shell chat events stream has no body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  const idleMs = 45_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let idleRecycle = false;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleRecycle = true;
      void reader.cancel().catch(() => {});
    }, idleMs);
  };
  armIdle();
  const onParentAbort = () => {
    if (idleTimer) clearTimeout(idleTimer);
    void reader.cancel().catch(() => {});
  };
  if (input.signal.aborted) onParentAbort();
  else input.signal.addEventListener("abort", onParentAbort, { once: true });

  try {
    while (!input.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        parseSseChunk(part, (event, data) => {
          if (event === AGENT_SHELL_CHAT_SSE_EVENT) {
            const payload = parseAgentShellChatMessagePayload(data);
            if (!payload) return;
            input.onMessage(payload);
            return;
          }
          if (event === AGENT_SHELL_CHAT_STATUS_SSE_EVENT) {
            const payload = parseAgentShellChatStatusPayload(data);
            if (!payload) return;
            input.onStatus?.(payload);
          }
        });
      }
    }
  } catch (error) {
    if (input.signal.aborted || idleRecycle) return;
    throw error;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    input.signal.removeEventListener("abort", onParentAbort);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

/** Keep reconnecting with exponential backoff until aborted. */
export function startAgentShellChatEventsLoop(input: {
  signal: AbortSignal;
  onMessage: (payload: AgentShellChatMessagePayload) => void;
  onStatus?: (payload: AgentShellChatStatusPayload) => void;
  /** Called when the stream becomes live (including after reconnect). */
  onLive?: () => void;
  requestStream?: (
    path: string,
    init?: RequestInit,
  ) => Promise<Response>;
}): void {
  let attempt = 0;
  const run = async () => {
    while (!input.signal.aborted) {
      try {
        await subscribeAgentShellChatEvents({
          signal: input.signal,
          onMessage: input.onMessage,
          onStatus: input.onStatus,
          onConnection: () => {
            attempt = 0;
            input.onLive?.();
          },
          requestStream: input.requestStream,
        });
        attempt = 0;
      } catch (error) {
        if (input.signal.aborted) return;
        if (isCloudCoreApiError(error) && error.status === 401) {
          // No owner key — stop retrying until remount.
          return;
        }
        console.warn("[agent-shell-chat-sse]", error);
        attempt += 1;
        const delay = Math.min(8_000, 500 * 2 ** Math.min(attempt, 4));
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
          input.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    }
  };
  void run();
}
