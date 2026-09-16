/**
 * In-memory inbox for Grok Bot → BDV file-task callbacks.
 * Results are keyed by requestId and expire after TTL.
 */
export type FileTaskCallbackSuccess = {
  readonly ok: true;
  readonly requestId: string;
  readonly taskId?: string;
  readonly taskRef?: string;
  readonly title?: string;
  readonly projectId?: string;
  readonly summary?: string;
};

export type FileTaskCallbackFailure = {
  readonly ok: false;
  readonly requestId: string;
  readonly error: string;
};

export type FileTaskCallbackResult = FileTaskCallbackSuccess | FileTaskCallbackFailure;

type PendingEntry = {
  readonly createdAt: number;
  result: FileTaskCallbackResult | null;
};

const TTL_MS = 30 * 60 * 1000;
const pending = new Map<string, PendingEntry>();

function prune(now = Date.now()): void {
  for (const [requestId, entry] of pending) {
    if (now - entry.createdAt > TTL_MS) {
      pending.delete(requestId);
    }
  }
}

export function registerFileTaskRequest(requestId: string): void {
  prune();
  pending.set(requestId, { createdAt: Date.now(), result: null });
}

export function storeFileTaskCallbackResult(result: FileTaskCallbackResult): {
  readonly accepted: boolean;
  readonly error?: string;
} {
  prune();
  const entry = pending.get(result.requestId);
  if (!entry) {
    // Accept late/unknown requestIds so agents are not stuck on 404 — still store.
    pending.set(result.requestId, { createdAt: Date.now(), result });
    return { accepted: true };
  }
  if (entry.result != null) {
    return { accepted: false, error: "Result already recorded for this requestId" };
  }
  entry.result = result;
  return { accepted: true };
}

export function readFileTaskCallbackResult(
  requestId: string,
): FileTaskCallbackResult | null | undefined {
  prune();
  const entry = pending.get(requestId);
  if (!entry) return undefined;
  return entry.result;
}

export function authorizationHeaderFromWebhookKey(webhookKey: string): string {
  const trimmed = webhookKey.trim();
  if (!trimmed) return "";
  if (/^(Bearer|Basic)\s+/i.test(trimmed)) return trimmed;
  return `Bearer ${trimmed}`;
}
