/**
 * Authenticated SSE subscriber for AgentMail inbox updates.
 * Attach when the mobile email list exists (same protocol as desktop).
 */

import { useEffect } from "react";

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
  const response = await input.client.requestStream("/api/v1/email/events", {
    method: "GET",
    signal: input.signal,
  });
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Email events stream has no body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!input.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
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
      } catch {
        if (input.signal.aborted) return;
        attempt += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 4));
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

/**
 * Subscribe to core `GET /api/v1/email/events` while `enabled`.
 * Wire to the mobile email list when that UI exists.
 */
export function useEmailInboxEvents(input: {
  client: EmailInboxEventsClient;
  enabled: boolean;
  onUpdated: (payload: EmailInboxUpdatedPayload) => void;
}): void {
  const { client, enabled, onUpdated } = input;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    startEmailInboxEventsLoop({
      client,
      signal: controller.signal,
      onUpdated,
    });
    return () => controller.abort();
  }, [client, enabled, onUpdated]);
}
