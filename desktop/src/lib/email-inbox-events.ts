/**
 * Authenticated SSE subscriber for AgentMail inbox updates.
 * Desktop / mobile both use fetch + Authorization (EventSource cannot).
 */

export type EmailInboxUpdatedPayload = {
  inboxId: string;
  messageId: string | null;
};

export type EmailInboxEventsClient = {
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

export async function subscribeEmailInboxEvents(input: {
  client: EmailInboxEventsClient;
  signal: AbortSignal;
  onUpdated: (payload: EmailInboxUpdatedPayload) => void;
  onError?: (error: unknown) => void;
}): Promise<void> {
  // Connect with a timeout so a hung open cannot stall the reconnect loop.
  // Once headers arrive, only `input.signal` (effect cleanup) cancels the stream.
  const response = await new Promise<Response>((resolve, reject) => {
    const timeoutMs = 15_000;
    const timer = setTimeout(() => {
      reject(new Error("Email events connect timed out"));
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
      .requestStream("/api/v1/email/events", {
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
    throw new Error("Email events stream has no body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  // Server pings every 15s. If the TCP half-closes (WebKit "Load failed"
  // without rejecting read), we never reconnect and miss webhook fan-out.
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
          if (event !== "email.updated") return;
          try {
            const parsed = JSON.parse(data) as {
              inboxId?: unknown;
              messageId?: unknown;
            };
            const inboxId =
              typeof parsed.inboxId === "string" ? parsed.inboxId.trim() : "";
            if (!inboxId) return;
            input.onUpdated({
              inboxId,
              messageId:
                typeof parsed.messageId === "string"
                  ? parsed.messageId
                  : null,
            });
          } catch {
            // Ignore malformed event payloads.
          }
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
export function startEmailInboxEventsLoop(input: {
  client: EmailInboxEventsClient;
  signal: AbortSignal;
  onUpdated: (payload: EmailInboxUpdatedPayload) => void;
  enabled?: boolean;
}): void {
  if (input.enabled === false) return;
  let attempt = 0;
  const run = async () => {
    while (!input.signal.aborted) {
      try {
        await subscribeEmailInboxEvents({
          client: input.client,
          signal: input.signal,
          onUpdated: input.onUpdated,
        });
        attempt = 0;
      } catch (error) {
        if (input.signal.aborted) return;
        attempt += 1;
        // Prefer quick retries after WebKit "Load failed" (core restart / dropped stream).
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
