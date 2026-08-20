import { Webhook } from "svix";

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
  if (!eventType) return null;
  return { eventType, eventId, inboxId, messageId };
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
export function handleAgentMailWebhookDelivery(input: {
  rawBody: string;
  headers: Record<string, string>;
  secrets: AgentMailWebhookSecretRow[];
  deliveryId?: string | null;
}): { ok: boolean; published: boolean; workspaceId: string | null } {
  const { rawBody, headers, secrets } = input;
  if (secrets.length === 0) {
    return { ok: false, published: false, workspaceId: null };
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
    return { ok: false, published: false, workspaceId: null };
  }

  const deliveryKey =
    input.deliveryId?.trim() ||
    headers["svix-id"]?.trim() ||
    parseAgentMailWebhookPayload(payload)?.eventId ||
    null;
  if (deliveryKey && rememberWebhookDelivery(deliveryIdOrFallback(deliveryKey))) {
    return { ok: true, published: false, workspaceId: matched.workspaceId };
  }

  const parsed = parseAgentMailWebhookPayload(payload);
  if (!parsed || parsed.eventType !== "message.received") {
    return { ok: true, published: false, workspaceId: matched.workspaceId };
  }
  if (!parsed.inboxId || !matched.inboxIds.includes(parsed.inboxId)) {
    return { ok: true, published: false, workspaceId: matched.workspaceId };
  }

  publishEmailUpdated({
    workspaceId: matched.workspaceId,
    inboxId: parsed.inboxId,
    messageId: parsed.messageId,
  });
  return { ok: true, published: true, workspaceId: matched.workspaceId };
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
