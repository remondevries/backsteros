import { createHmac, timingSafeEqual } from "node:crypto";

import { newId } from "../../../lib/crypto.js";
import type {
  SocialComment,
  SocialConversation,
  SocialMessage,
  SocialNormalizedEvent,
  SocialPost,
} from "../../types.js";
import { mapZernioPlatform } from "./platform.js";

const PROVIDER = "zernio";

function equalHex(a: string, b: string): boolean {
  try {
    const aa = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (aa.length === 0 || aa.length !== bb.length) return false;
    return timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function equalString(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length === 0 || aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}


export function zernioHeadersFromRequest(
  header: (name: string) => string | undefined,
): Record<string, string> {
  const names = [
    "x-zernio-signature",
    "x-zernio-event-id",
    "x-zernio-event-type",
  ] as const;
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = header(name) ?? header(name.toUpperCase());
    if (value) out[name] = value;
  }
  return out;
}

/**
 * Verify HMAC-SHA256 `X-Zernio-Signature` over the raw body.
 * Accepts hex, base64, or `sha256=<hex>` forms.
 */
export function verifyZernioWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  const secretTrimmed = secret.trim();
  const signature = (signatureHeader ?? "").trim();
  if (!secretTrimmed || !signature) return false;

  const expectedHex = createHmac("sha256", secretTrimmed)
    .update(rawBody, "utf8")
    .digest("hex");
  const expectedBase64 = createHmac("sha256", secretTrimmed)
    .update(rawBody, "utf8")
    .digest("base64");

  const candidates = [
    signature,
    signature.replace(/^sha256=/i, "").trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (equalHex(candidate, expectedHex)) return true;
    if (equalString(candidate, expectedBase64)) return true;
  }
  return false;
}


export function extractZernioEventId(
  headers: Record<string, string>,
  payload?: unknown,
): string | null {
  const fromHeader =
    headers["x-zernio-event-id"]?.trim() ||
    headers["X-Zernio-Event-Id"]?.trim() ||
    "";
  if (fromHeader) return fromHeader;
  const record = asRecord(payload);
  if (!record) return null;
  return (
    asString(record.eventId) ??
    asString(record.event_id) ??
    asString(record.id) ??
    null
  );
}

export function extractZernioEventType(
  headers: Record<string, string>,
  payload?: unknown,
): string | null {
  const fromHeader =
    headers["x-zernio-event-type"]?.trim() ||
    headers["X-Zernio-Event-Type"]?.trim() ||
    "";
  if (fromHeader) return fromHeader;
  const record = asRecord(payload);
  if (!record) return null;
  return (
    asString(record.event) ??
    asString(record.type) ??
    asString(record.eventType) ??
    asString(record.event_type) ??
    null
  );
}

export function translateZernioWebhook(
  headers: Record<string, string>,
  rawBody: string,
  context: { workspaceId: string },
): SocialNormalizedEvent[] {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return [];
  }

  const eventId =
    extractZernioEventId(headers, payload) ?? `generated:${newId()}`;
  const eventType = extractZernioEventType(headers, payload);
  if (!eventType) return [];

  const record = asRecord(payload) ?? {};
  const data =
    asRecord(record.data) ??
    asRecord(record.payload) ??
    record;

  if (eventType === "comment.received") {
    const comment = mapComment(data, context.workspaceId);
    if (!comment) return [];
    return [{ type: "comment.received", eventId, comment }];
  }

  if (
    eventType === "message.received" ||
    eventType === "message.sent" ||
    eventType === "message.delivered" ||
    eventType === "message.read" ||
    eventType === "message.failed"
  ) {
    const conversation = mapConversation(data, context.workspaceId);
    const message = mapMessage(data, context.workspaceId, conversation?.id);
    if (eventType === "message.received" && message && conversation) {
      return [
        {
          type: "message.received",
          eventId,
          message,
          conversation,
        },
      ];
    }
    if (message) {
      return [{ type: "message.status", eventId, message }];
    }
    return [];
  }

  if (eventType === "conversation.started") {
    const conversation = mapConversation(data, context.workspaceId);
    if (!conversation) return [];
    return [{ type: "conversation.started", eventId, conversation }];
  }

  if (
    eventType.startsWith("post.") ||
    eventType === "post.scheduled" ||
    eventType === "post.published" ||
    eventType === "post.failed" ||
    eventType === "post.partial"
  ) {
    const post = mapPost(data, context.workspaceId);
    if (!post) return [];
    return [{ type: "post.status", eventId, post }];
  }

  if (eventType === "account.disconnected") {
    const externalAccountId =
      asString(data.accountId) ??
      asString(data.account_id) ??
      asString(asRecord(data.account)?.id) ??
      asString(asRecord(data.account)?._id);
    if (!externalAccountId) return [];
    return [
      {
        type: "account.disconnected",
        eventId,
        accountId: "",
        externalAccountId,
      },
    ];
  }

  if (eventType === "analytics.synced") {
    const cursor =
      asString(data.cursor) ??
      asString(data.nextCursor) ??
      asString(data.analyticsCursor) ??
      null;
    return [{ type: "analytics.synced", eventId, cursor }];
  }

  return [];
}

function mapComment(
  data: Record<string, unknown>,
  workspaceId: string,
): SocialComment | null {
  const comment =
    asRecord(data.comment) ??
    (asString(data.id) || asString(data._id) || asString(data.commentId)
      ? data
      : null);
  if (!comment) return null;
  const externalId =
    asString(comment.id) ??
    asString(comment._id) ??
    asString(comment.commentId);
  const postExternalId =
    asString(data.postId) ??
    asString(data.post_id) ??
    asString(asRecord(data.post)?.id) ??
    asString(comment.postId);
  if (!externalId || !postExternalId) return null;
  const accountExternalId =
    asString(data.accountId) ??
    asString(data.account_id) ??
    asString(asRecord(data.account)?.id) ??
    "";
  return {
    id: `zernio-comment:${externalId}`,
    workspaceId,
    postId: `zernio-post:${postExternalId}`,
    accountId: accountExternalId ? `zernio-account:${accountExternalId}` : "",
    externalId,
    authorHandle:
      asString(comment.authorUsername) ??
      asString(comment.authorHandle) ??
      asString(asRecord(comment.author)?.username) ??
      asString(asRecord(comment.author)?.handle) ??
      "unknown",
    authorExternalId:
      asString(comment.authorId) ??
      asString(asRecord(comment.author)?.id) ??
      null,
    text:
      asString(comment.message) ??
      asString(comment.text) ??
      asString(comment.content) ??
      "",
    createdAt:
      asString(comment.createdAt) ??
      asString(comment.timestamp) ??
      new Date().toISOString(),
    parentCommentId:
      asString(comment.parentId) ??
      asString(comment.parentCommentId) ??
      null,
    hidden: comment.hidden === true,
    contactId: null,
  };
}

function mapConversation(
  data: Record<string, unknown>,
  workspaceId: string,
): SocialConversation | null {
  const conversation =
    asRecord(data.conversation) ??
    (asString(data.conversationId) ? data : null);
  const externalId =
    asString(conversation?.id) ??
    asString(conversation?._id) ??
    asString(data.conversationId) ??
    asString(data.conversation_id);
  if (!externalId) return null;
  const accountExternalId =
    asString(data.accountId) ??
    asString(data.account_id) ??
    asString(asRecord(data.account)?.id) ??
    asString(conversation?.accountId) ??
    "";
  return {
    id: `zernio-conversation:${externalId}`,
    workspaceId,
    accountId: accountExternalId
      ? `zernio-account:${accountExternalId}`
      : "",
    kind: "dm",
    participantHandle:
      asString(conversation?.participantUsername) ??
      asString(data.participantUsername) ??
      asString(asRecord(data.participant)?.username) ??
      null,
    participantExternalId:
      asString(conversation?.participantId) ??
      asString(data.participantId) ??
      asString(asRecord(data.participant)?.id) ??
      null,
    contactId: null,
    ticketId: null,
    lastMessageAt:
      asString(conversation?.lastMessageAt) ??
      asString(data.timestamp) ??
      new Date().toISOString(),
  };
}

function mapMessage(
  data: Record<string, unknown>,
  workspaceId: string,
  conversationId: string | undefined,
): SocialMessage | null {
  const message =
    asRecord(data.message) ??
    (asString(data.messageId) || asString(data.id) ? data : null);
  if (!message) return null;
  const externalId =
    asString(message.id) ??
    asString(message._id) ??
    asString(message.messageId) ??
    asString(data.messageId);
  const convId =
    conversationId ??
    (asString(data.conversationId)
      ? `zernio-conversation:${asString(data.conversationId)}`
      : null);
  if (!convId) return null;
  const directionRaw =
    asString(message.direction) ?? asString(data.direction) ?? "in";
  const direction =
    directionRaw === "out" ||
    directionRaw === "outbound" ||
    directionRaw === "sent"
      ? "out"
      : "in";
  return {
    id: externalId ? `zernio-message:${externalId}` : `zernio-message:${newId()}`,
    workspaceId,
    conversationId: convId,
    externalId,
    direction,
    text:
      asString(message.text) ??
      asString(message.message) ??
      asString(message.content) ??
      "",
    sentAt:
      asString(message.createdAt) ??
      asString(message.timestamp) ??
      asString(data.timestamp) ??
      new Date().toISOString(),
    status: mapMessageStatus(asString(message.status) ?? asString(data.status)),
  };
}

function mapPost(
  data: Record<string, unknown>,
  workspaceId: string,
): SocialPost | null {
  const post =
    asRecord(data.post) ??
    (asString(data.postId) || asString(data.id) ? data : null);
  if (!post) return null;
  const externalId =
    asString(post.id) ??
    asString(post._id) ??
    asString(post.postId) ??
    asString(data.postId);
  if (!externalId) return null;
  const platformRaw =
    asString(post.platform) ??
    asString(data.platform) ??
    asString(asRecord(asArray(post.platforms)?.[0])?.platform);
  const platform = mapZernioPlatform(platformRaw) ?? "x";
  const accountExternalId =
    asString(data.accountId) ??
    asString(asRecord(asArray(post.platforms)?.[0])?.accountId) ??
    "";
  const statusRaw = asString(post.status) ?? asString(data.status) ?? "published";
  return {
    id: `zernio-post:${externalId}`,
    workspaceId,
    accountId: accountExternalId
      ? `zernio-account:${accountExternalId}`
      : "",
    platform,
    provider: PROVIDER,
    externalId,
    url:
      asString(post.platformPostUrl) ??
      asString(post.url) ??
      asString(data.platformPostUrl) ??
      null,
    authorHandle: null,
    authorExternalId: null,
    text:
      asString(post.content) ??
      asString(post.text) ??
      asString(post.message) ??
      "",
    media: [],
    status: mapPostStatus(statusRaw),
    scheduledAt: asString(post.scheduledFor) ?? asString(post.scheduledAt),
    postedAt: asString(post.publishedAt) ?? asString(post.postedAt),
    engagement: null,
    contactId: null,
    organizationId: null,
  };
}

function mapPostStatus(
  status: string,
): SocialPost["status"] {
  const s = status.toLowerCase();
  if (s.includes("draft")) return "draft";
  if (s.includes("schedul")) return "scheduled";
  if (s.includes("fail")) return "failed";
  if (s.includes("partial")) return "partial";
  return "published";
}

function mapMessageStatus(
  status: string | null,
): SocialMessage["status"] {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes("fail")) return "failed";
  if (s.includes("read")) return "read";
  if (s.includes("deliver")) return "delivered";
  if (s.includes("pend")) return "pending";
  return "sent";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}
