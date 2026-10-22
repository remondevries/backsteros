import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_TIMESTAMP_SKEW_SEC = 5 * 60;

export type ChatwootWebhookHeaders = {
  signature?: string;
  timestamp?: string;
  deliveryId?: string;
};

export function chatwootHeadersFromRequest(
  header: (name: string) => string | undefined,
): ChatwootWebhookHeaders {
  return {
    signature:
      header("x-chatwoot-signature") ?? header("X-Chatwoot-Signature"),
    timestamp:
      header("x-chatwoot-timestamp") ?? header("X-Chatwoot-Timestamp"),
    deliveryId:
      header("x-chatwoot-delivery") ?? header("X-Chatwoot-Delivery"),
  };
}

function equalString(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length === 0 || aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

/**
 * Verify Chatwoot HMAC: sha256=HMAC-SHA256(secret, "{timestamp}.{raw_body}").
 * Rejects missing/stale timestamps (>5 min) when a signature is present.
 */
export function verifyChatwootWebhookSignature(
  secret: string,
  rawBody: string,
  headers: ChatwootWebhookHeaders,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const secretTrimmed = secret.trim();
  const signature = (headers.signature ?? "").trim();
  const timestamp = (headers.timestamp ?? "").trim();
  if (!secretTrimmed || !signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowSec - ts) > MAX_TIMESTAMP_SKEW_SEC) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", secretTrimmed)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex");

  const candidates = [
    signature,
    signature.startsWith("sha256=")
      ? signature
      : `sha256=${signature.replace(/^sha256=/i, "").trim()}`,
  ];
  for (const candidate of candidates) {
    if (equalString(candidate, expected)) return true;
  }
  return false;
}

export type ChatwootWebhookEventType =
  | "message_created"
  | "message_updated"
  | "conversation_created"
  | "conversation_updated"
  | "conversation_status_changed"
  | string;

export type ParsedChatwootWebhook = {
  event: ChatwootWebhookEventType;
  accountId: string | null;
  conversationId: string | null;
  messageId: string | null;
  payload: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function parseChatwootWebhookPayload(
  raw: unknown,
): ParsedChatwootWebhook | null {
  const record = asRecord(raw);
  if (!record) return null;
  const event = asString(record.event);
  if (!event) return null;
  const conversation = asRecord(record.conversation);
  const account = asRecord(record.account);
  const conversationId =
    asString(conversation?.id) ??
    asString(record.id) ??
    asString(record.conversation_id);
  const messageId =
    event.startsWith("message_")
      ? asString(record.id)
      : asString(record.message_id);
  return {
    event,
    accountId: asString(account?.id) ?? asString(record.account_id),
    conversationId:
      event.startsWith("conversation_") || event.startsWith("message_")
        ? conversationId
        : asString(conversation?.id),
    messageId: event.startsWith("message_") ? messageId : null,
    payload: raw,
  };
}

export function extractChatwootDeliveryId(
  headers: ChatwootWebhookHeaders,
  payload?: unknown,
): string | null {
  const fromHeader = headers.deliveryId?.trim();
  if (fromHeader) return fromHeader;
  const record = asRecord(payload);
  if (!record) return null;
  return (
    asString(record.delivery_id) ??
    asString(record.deliveryId) ??
    asString(record.id)
  );
}
