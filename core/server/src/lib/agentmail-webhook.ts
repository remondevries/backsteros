import { Webhook } from "svix";

import {
  formatAgentMailAddress,
  mapAgentMailMessageHeaders,
} from "./agentmail-client.js";
import { invalidateAgentMailMessageDetailCache } from "./agentmail-message-detail-cache.js";
import { publishEmailUpdated } from "./email-inbox-events.js";

const DEDUPE_TTL_MS = 10 * 60_000;
const DEDUPE_MAX = 2_000;

const seenDeliveryIds = new Map<string, number>();

export type AgentMailWebhookSecretRow = {
  workspaceId: string;
  secret: string;
  inboxIds: string[];
};

export type AgentMailWebhookPayload = {
  eventType: string;
  eventId: string | null;
  inboxId: string | null;
  messageId: string | null;
  threadId: string | null;
  timestamp: string | null;
  labels: string[];
  from: string | null;
  subject: string | null;
  preview: string | null;
  text: string | null;
  headers: Record<string, string> | null;
};

export function pruneWebhookDedupe(now = Date.now()): void {
  for (const [id, expiresAt] of seenDeliveryIds) {
    if (expiresAt <= now) seenDeliveryIds.delete(id);
  }
  if (seenDeliveryIds.size <= DEDUPE_MAX) return;
  const excess = seenDeliveryIds.size - DEDUPE_MAX;
  let removed = 0;
  for (const id of seenDeliveryIds.keys()) {
    seenDeliveryIds.delete(id);
    removed += 1;
    if (removed >= excess) break;
  }
}

export function rememberWebhookDelivery(id: string, now = Date.now()): boolean {
  pruneWebhookDedupe(now);
  const key = id.trim();
  if (!key) return false;
  if (seenDeliveryIds.has(key)) return true;
  seenDeliveryIds.set(key, now + DEDUPE_TTL_MS);
  return false;
}

export function clearWebhookDedupe(): void {
  seenDeliveryIds.clear();
}

export function parseAgentMailWebhookPayload(
  raw: unknown,
): AgentMailWebhookPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const eventType =
    (typeof record.event_type === "string" && record.event_type.trim()) ||
    (typeof record.eventType === "string" && record.eventType.trim()) ||
    "";
  const eventId =
    (typeof record.event_id === "string" && record.event_id.trim()) ||
    (typeof record.eventId === "string" && record.eventId.trim()) ||
    null;
  const message =
    record.message && typeof record.message === "object" && !Array.isArray(record.message)
      ? (record.message as Record<string, unknown>)
      : null;
  const inboxId =
    (message && typeof message.inbox_id === "string" && message.inbox_id.trim()) ||
    (message && typeof message.inboxId === "string" && message.inboxId.trim()) ||
    null;
  const messageId =
    (message && typeof message.message_id === "string" && message.message_id.trim()) ||
    (message && typeof message.messageId === "string" && message.messageId.trim()) ||
    null;
  const threadId =
    (message && typeof message.thread_id === "string" && message.thread_id.trim()) ||
    (message && typeof message.threadId === "string" && message.threadId.trim()) ||
    null;
  const timestamp =
    (message && typeof message.timestamp === "string" && message.timestamp.trim()) ||
    (message && typeof message.created_at === "string" && message.created_at.trim()) ||
    (message && typeof message.createdAt === "string" && message.createdAt.trim()) ||
    null;
  const rawLabels = message && Array.isArray(message.labels) ? message.labels : [];
  const labels = rawLabels.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const from = message ? formatAgentMailAddress(message.from) || null : null;
  const subject =
    (message && typeof message.subject === "string" && message.subject) || null;
  const preview =
    (message && typeof message.preview === "string" && message.preview) || null;
  const text =
    (message && typeof message.text === "string" && message.text) ||
    (message &&
      typeof message.extracted_text === "string" &&
      message.extracted_text) ||
    (message &&
      typeof message.extractedText === "string" &&
      message.extractedText) ||
    null;
  const headers = message
    ? mapAgentMailMessageHeaders(message.headers)
    : null;
  if (!eventType) return null;
  return {
    eventType,
    eventId,
    inboxId,
    messageId,
    threadId,
    timestamp,
    labels,
    from,
    subject,
    preview,
    text,
    headers,
  };
}

export function verifyAgentMailWebhook(
  secret: string,
  rawBody: string,
  headers: Record<string, string>,
): unknown {
  return new Webhook(secret).verify(rawBody, headers);
}

/**
 * Verify against stored secrets, dedupe, and publish when a selected inbox
 * receives `message.received`. Returns whether the signature verified.
 */
export type AgentMailWebhookDeliveryResult = {
  ok: boolean;
  published: boolean;
  workspaceId: string | null;
  inboxId: string | null;
  messageId: string | null;
  threadId: string | null;
  timestamp: string | null;
  labels: string[];
};

export function handleAgentMailWebhookDelivery(input: {
  rawBody: string;
  headers: Record<string, string>;
  secrets: AgentMailWebhookSecretRow[];
  deliveryId?: string | null;
}): AgentMailWebhookDeliveryResult {
  const empty = {
    ok: false,
    published: false,
    workspaceId: null,
    inboxId: null,
    messageId: null,
    threadId: null,
    timestamp: null,
    labels: [] as string[],
  } satisfies AgentMailWebhookDeliveryResult;
  const { rawBody, headers, secrets } = input;
  if (secrets.length === 0) {
    return empty;
  }

  let matched: AgentMailWebhookSecretRow | null = null;
  let payload: unknown = null;
  for (const row of secrets) {
    try {
      payload = verifyAgentMailWebhook(row.secret, rawBody, headers);
      matched = row;
      break;
    } catch {
      // Try the next workspace secret.
    }
  }
  if (!matched) {
    return empty;
  }

  const deliveryKey =
    input.deliveryId?.trim() ||
    headers["svix-id"]?.trim() ||
    parseAgentMailWebhookPayload(payload)?.eventId ||
    null;
  if (deliveryKey && rememberWebhookDelivery(deliveryIdOrFallback(deliveryKey))) {
    return {
      ok: true,
      published: false,
      workspaceId: matched.workspaceId,
      inboxId: null,
      messageId: null,
      threadId: null,
      timestamp: null,
      labels: [],
    };
  }

  const parsed = parseAgentMailWebhookPayload(payload);
  if (!parsed || parsed.eventType !== "message.received") {
    return {
      ok: true,
      published: false,
      workspaceId: matched.workspaceId,
      inboxId: null,
      messageId: null,
      threadId: null,
      timestamp: null,
      labels: [],
    };
  }
  if (!parsed.inboxId) {
    return {
      ok: true,
      published: false,
      workspaceId: matched.workspaceId,
      inboxId: null,
      messageId: null,
      threadId: null,
      timestamp: null,
      labels: [],
    };
  }

  invalidateAgentMailMessageDetailCache(
    matched.workspaceId,
    parsed.inboxId,
    parsed.messageId,
  );
  publishEmailUpdated({
    workspaceId: matched.workspaceId,
    inboxId: parsed.inboxId,
    messageId: parsed.messageId,
  });
  // OS-146: agent outbound webhooks for inbound AgentMail messages.
  if (parsed.messageId) {
    void import("../services/agent-message-webhooks.js")
      .then(({ notifyAgentMessageWebhooks }) =>
        notifyAgentMessageWebhooks({
          event: "email.message",
          direction: "inbound",
          workspaceId: matched.workspaceId,
          inboxId: parsed.inboxId!,
          messageId: parsed.messageId!,
          threadId: parsed.threadId,
          timestamp: new Date().toISOString(),
        }),
      )
      .catch((error) => {
        console.warn(
          "[agentmail] inbound message webhook notify failed",
          error instanceof Error ? error.message : error,
        );
      });
    // OS-187: append mail to linked support-ticket timelines (no send).
    // Pass headers always; use a body snapshot only when text/preview is present
    // so a headers-only webhook still fetches the full thread for upgrades.
    void import("../services/ticket-email-sync.js")
      .then(({ syncLinkedTicketsForEmailMessage }) =>
        syncLinkedTicketsForEmailMessage({
          workspaceId: matched.workspaceId,
          inboxId: parsed.inboxId!,
          messageId: parsed.messageId!,
          threadId: parsed.threadId,
          messageAt: parsed.timestamp ?? null,
          headers: parsed.headers,
          message:
            parsed.text || parsed.preview
              ? {
                  messageId: parsed.messageId!,
                  threadId: parsed.threadId ?? "",
                  from: parsed.from ?? "",
                  subject: parsed.subject ?? "",
                  preview: parsed.preview,
                  text: parsed.text,
                  timestamp: parsed.timestamp ?? "",
                  labels: parsed.labels,
                  headers: parsed.headers,
                }
              : null,
        }),
      )
      .catch((error) => {
        console.warn(
          "[agentmail] ticket email timeline sync failed",
          error instanceof Error ? error.message : error,
        );
      });
  }
  return {
    ok: true,
    published: true,
    workspaceId: matched.workspaceId,
    inboxId: parsed.inboxId,
    messageId: parsed.messageId,
    threadId: parsed.threadId,
    timestamp: parsed.timestamp,
    labels: parsed.labels,
  };
}

function deliveryIdOrFallback(id: string): string {
  return id;
}

export function svixHeadersFromRequest(
  header: (name: string) => string | undefined,
): Record<string, string> {
  const names = ["svix-id", "svix-timestamp", "svix-signature"] as const;
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = header(name) ?? header(name.toUpperCase());
    if (value) out[name] = value;
  }
  return out;
}
