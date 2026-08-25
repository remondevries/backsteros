/**
 * Authenticated SSE subscriber for workspace entity updates.
 * Desktop uses this to refresh REST snapshots and invalidate Tier D caches
 * when agents (or other clients) write via the API before PowerSync catches up.
 */

export type WorkspaceUpdatedKind =
  | "task"
  | "meeting"
  | "project"
  | "document"
  | "letter";

export type WorkspaceUpdatedPayload = {
  kind: WorkspaceUpdatedKind;
  entityId: string;
  projectId: string | null;
  reason: "comment" | "patch" | null;
};

export type WorkspaceEventsClient = {
  requestStream: (path: string, init?: RequestInit) => Promise<Response>;
};

const WORKSPACE_UPDATED_KINDS = new Set<WorkspaceUpdatedKind>([
  "task",
  "meeting",
  "project",
  "document",
  "letter",
]);

function parseWorkspaceUpdatedKind(value: unknown): WorkspaceUpdatedKind | null {
  if (typeof value !== "string") return null;
  return WORKSPACE_UPDATED_KINDS.has(value as WorkspaceUpdatedKind)
    ? (value as WorkspaceUpdatedKind)
    : null;
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

export async function subscribeWorkspaceEvents(input: {
  client: WorkspaceEventsClient;
  signal: AbortSignal;
  onUpdated: (payload: WorkspaceUpdatedPayload) => void;
  onError?: (error: unknown) => void;
}): Promise<void> {
  const response = await new Promise<Response>((resolve, reject) => {
    const timeoutMs = 15_000;
    const timer = setTimeout(() => {
      reject(new Error("Workspace events connect timed out"));
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
      .requestStream("/api/v1/workspace/events", {
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
    throw new Error("Workspace events stream has no body");
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
          if (event !== "workspace.updated") return;
          try {
            const parsed = JSON.parse(data) as {
              kind?: unknown;
              entityId?: unknown;
              projectId?: unknown;
              reason?: unknown;
            };
            const entityId =
              typeof parsed.entityId === "string" ? parsed.entityId.trim() : "";
            if (!entityId) return;
            const kind = parseWorkspaceUpdatedKind(parsed.kind);
            if (!kind) return;
            input.onUpdated({
              kind,
              entityId,
              projectId:
                typeof parsed.projectId === "string"
                  ? parsed.projectId
                  : null,
              reason:
                parsed.reason === "comment" || parsed.reason === "patch"
                  ? parsed.reason
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
export function startWorkspaceEventsLoop(input: {
  client: WorkspaceEventsClient;
  signal: AbortSignal;
  onUpdated: (payload: WorkspaceUpdatedPayload) => void;
  enabled?: boolean;
}): void {
  if (input.enabled === false) return;
  let attempt = 0;
  const run = async () => {
    while (!input.signal.aborted) {
      try {
        await subscribeWorkspaceEvents({
          client: input.client,
          signal: input.signal,
          onUpdated: input.onUpdated,
        });
        attempt = 0;
      } catch (error) {
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
