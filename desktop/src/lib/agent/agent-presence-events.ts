/**
 * Authenticated SSE subscriber for live agent-working presence.
 * Complements REST poll so remote shells can pulse without waiting ~12s.
 */

export type AgentPresenceLivePayload = {
  taskId: string;
  live: boolean;
};

export type AgentPresenceEventsClient = {
  requestStream: (path: string, init?: RequestInit) => Promise<Response>;
};

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

function parseAgentPresencePayload(data: string): AgentPresenceLivePayload | null {
  try {
    const parsed = JSON.parse(data) as {
      taskId?: unknown;
      live?: unknown;
    };
    const taskId =
      typeof parsed.taskId === "string" ? parsed.taskId.trim() : "";
    if (!taskId) return null;
    if (parsed.live !== true && parsed.live !== false) return null;
    return { taskId, live: parsed.live };
  } catch {
    return null;
  }
}

export async function subscribeAgentPresenceEvents(input: {
  client: AgentPresenceEventsClient;
  signal: AbortSignal;
  onPresence: (payload: AgentPresenceLivePayload) => void;
  onError?: (error: unknown) => void;
}): Promise<void> {
  const response = await new Promise<Response>((resolve, reject) => {
    const timeoutMs = 15_000;
    const timer = setTimeout(() => {
      reject(new Error("Agent presence events connect timed out"));
    }, timeoutMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (input.signal.aborted) {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    input.signal.addEventListener("abort", onAbort, { once: true });
    void input.client
      .requestStream("/api/v1/agent-presence/events", {
        method: "GET",
        signal: input.signal,
      })
      .then((res) => {
        clearTimeout(timer);
        input.signal.removeEventListener("abort", onAbort);
        resolve(res);
      })
      .catch((error) => {
        clearTimeout(timer);
        input.signal.removeEventListener("abort", onAbort);
        reject(error);
      });
  });
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Agent presence events stream has no body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  const idleMs = 45_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      void reader.cancel().catch(() => {});
    }, idleMs);
  };
  armIdle();
  const onParentAbort = () => {
    if (idleTimer) clearTimeout(idleTimer);
    void reader.cancel().catch(() => {});
  };
  if (input.signal.aborted) {
    onParentAbort();
  } else {
    input.signal.addEventListener("abort", onParentAbort, { once: true });
  }
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
          if (event !== "agent.presence") return;
          const payload = parseAgentPresencePayload(data);
          if (!payload) return;
          input.onPresence(payload);
        });
      }
    }
  } catch (error) {
    if (input.signal.aborted) return;
    input.onError?.(error);
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
export function startAgentPresenceEventsLoop(input: {
  client: AgentPresenceEventsClient;
  signal: AbortSignal;
  onPresence: (payload: AgentPresenceLivePayload) => void;
  enabled?: boolean;
}): void {
  if (input.enabled === false) return;
  let attempt = 0;
  const run = async () => {
    while (!input.signal.aborted) {
      try {
        await subscribeAgentPresenceEvents({
          client: input.client,
          signal: input.signal,
          onPresence: input.onPresence,
        });
        attempt = 0;
      } catch {
        if (input.signal.aborted) return;
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

/** Exported for focused tests. */
export function applyAgentPresenceLiveEvent(
  current: ReadonlySet<string>,
  payload: AgentPresenceLivePayload,
): ReadonlySet<string> {
  if (payload.live) {
    if (current.has(payload.taskId)) return current;
    const next = new Set(current);
    next.add(payload.taskId);
    return next;
  }
  if (!current.has(payload.taskId)) return current;
  const next = new Set(current);
  next.delete(payload.taskId);
  return next.size === 0 ? new Set() : next;
}
