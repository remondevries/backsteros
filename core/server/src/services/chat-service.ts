import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type {
  ChatConversation,
  ChatConversationDetail,
  ChatConversationsList,
  ChatMessage,
  ChatSyncResult,
  CreateChatMessageInput,
  ListChatConversationsQuery,
  UpdateChatConversationInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  chatConversations,
  chatMessages,
  chatWebhookEvents,
  type DbChatConversation,
  type DbChatMessage,
} from "../db/schema.js";
import { publishChatTyping, publishChatUpdated } from "../lib/chat-events.js";
import { newId } from "../lib/crypto.js";
import {
  ChatwootApiError,
  type ChatwootConversationSummary,
  type ChatwootMessageSummary,
  chatwootAsRecord,
  chatwootAsString,
  chatwootUnixOrIsoToIso,
  mapChatwootMessageType,
  parseChatwootConversationFromWebhookPayload,
  parseChatwootMessagePayload,
} from "../lib/chatwoot-client.js";
import {
  extractChatwootDeliveryId,
  parseChatwootWebhookPayload,
  verifyChatwootWebhookSignature,
  type ChatwootWebhookHeaders,
} from "../lib/chatwoot-webhook.js";
import {
  createChatwootClient,
  getChatwootCredentials,
  listChatwootWebhookSecrets,
  type ChatwootWebhookSecretRow,
} from "./chatwoot-settings.js";
import { notifyPeerOfEntityWrite } from "./core-replication/nudge.js";

function nudgeChatTwin(
  workspaceId: string,
  conversationId: string,
  reason: string,
): void {
  notifyPeerOfEntityWrite({
    workspaceId,
    entity: "chat_conversation",
    entityId: conversationId,
    reason,
    operation: "upsert",
  });
}

const STATUS_SET = new Set(["open", "resolved", "pending", "snoozed"]);

function normalizeStatus(raw: string | null | undefined): string {
  const value = (raw ?? "open").trim().toLowerCase();
  return STATUS_SET.has(value) ? value : "open";
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function mapConversation(row: DbChatConversation): ChatConversation {
  const priority = Number.isFinite(row.priority)
    ? Math.min(4, Math.max(0, Math.trunc(row.priority)))
    : 0;
  return {
    id: row.id,
    externalId: row.externalId,
    inboxId: row.inboxId,
    inboxName: row.inboxName,
    channelType: row.channelType,
    status: normalizeStatus(row.status) as ChatConversation["status"],
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    contactAvatarUrl: row.contactAvatarUrl,
    lastMessagePreview: row.lastMessagePreview,
    lastActivityAt: toIso(row.lastActivityAt),
    unread: row.unread,
    assigneeId: row.assigneeId ?? null,
    priority,
    dueDate: toIso(row.dueDate),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapMessage(row: DbChatMessage): ChatMessage {
  const direction =
    row.direction === "outgoing" || row.direction === "activity"
      ? row.direction
      : "incoming";
  return {
    id: row.id,
    conversationId: row.conversationId,
    externalId: row.externalId,
    direction,
    content: row.content,
    contentType: row.contentType,
    senderName: row.senderName,
    private: row.private,
    createdAt: row.createdAt.toISOString(),
  };
}

async function findConversationByExternalId(
  workspaceId: string,
  externalId: string,
): Promise<DbChatConversation | null> {
  // Include soft-deleted rows — unique (workspace, external_id) still holds,
  // and sync/webhooks must revive the row instead of inserting a duplicate.
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.workspaceId, workspaceId),
        eq(chatConversations.externalId, externalId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertConversationFromChatwoot(
  workspaceId: string,
  summary: ChatwootConversationSummary,
  options?: {
    inboxName?: string | null;
    markUnread?: boolean;
    lastMessagePreview?: string | null;
  },
): Promise<{ conversation: DbChatConversation; created: boolean }> {
  const existing = await findConversationByExternalId(workspaceId, summary.id);
  const now = new Date();
  const lastActivityAt = summary.lastActivityAt
    ? new Date(summary.lastActivityAt)
    : now;
  const unread =
    options?.markUnread === true
      ? true
      : options?.markUnread === false
        ? false
        : summary.unreadCount > 0;
  const preview =
    options?.lastMessagePreview ?? summary.lastMessagePreview ?? null;

  if (existing) {
    const [updated] = await db
      .update(chatConversations)
      .set({
        inboxId: summary.inboxId,
        inboxName: options?.inboxName ?? existing.inboxName,
        channelType: summary.channelType ?? existing.channelType,
        status: normalizeStatus(summary.status),
        contactName: summary.contact.name ?? existing.contactName,
        contactEmail: summary.contact.email ?? existing.contactEmail,
        contactPhone: summary.contact.phone ?? existing.contactPhone,
        contactAvatarUrl:
          summary.contact.avatarUrl ?? existing.contactAvatarUrl,
        lastMessagePreview: preview ?? existing.lastMessagePreview,
        lastActivityAt,
        unread,
        updatedAt: now,
        deletedAt: null,
      })
      .where(eq(chatConversations.id, existing.id))
      .returning();
    return { conversation: updated!, created: false };
  }

  const id = newId();
  const [created] = await db
    .insert(chatConversations)
    .values({
      id,
      workspaceId,
      externalId: summary.id,
      inboxId: summary.inboxId,
      inboxName: options?.inboxName ?? null,
      channelType: summary.channelType,
      status: normalizeStatus(summary.status),
      contactName: summary.contact.name,
      contactEmail: summary.contact.email,
      contactPhone: summary.contact.phone,
      contactAvatarUrl: summary.contact.avatarUrl,
      lastMessagePreview: preview,
      lastActivityAt,
      unread,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { conversation: created!, created: true };
}

export async function upsertMessageFromChatwoot(
  workspaceId: string,
  conversationId: string,
  summary: ChatwootMessageSummary,
): Promise<{ message: DbChatMessage; created: boolean }> {
  const [existing] = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.externalId, summary.id),
      ),
    )
    .limit(1);

  const createdAt = new Date(summary.createdAt);
  const direction = summary.messageType;
  if (existing) {
    // Always re-link conversationId — webhook bugs may have attached the
    // message to a wrong/deleted conversation; sync must move it.
    const [updated] = await db
      .update(chatMessages)
      .set({
        conversationId,
        content: summary.content,
        contentType: summary.contentType,
        direction,
        senderName: summary.senderName,
        private: summary.private,
        updatedAt: new Date(),
      })
      .where(eq(chatMessages.id, existing.id))
      .returning();
    return { message: updated!, created: false };
  }

  const [created] = await db
    .insert(chatMessages)
    .values({
      id: newId(),
      workspaceId,
      conversationId,
      externalId: summary.id,
      direction,
      content: summary.content,
      contentType: summary.contentType,
      senderName: summary.senderName,
      private: summary.private,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      updatedAt: new Date(),
    })
    .returning();
  return { message: created!, created: true };
}

export async function listChatConversations(
  workspaceId: string,
  query: ListChatConversationsQuery = {},
): Promise<ChatConversationsList> {
  const limit = query.limit ?? 50;
  const conditions = [
    eq(chatConversations.workspaceId, workspaceId),
    isNull(chatConversations.deletedAt),
  ];
  if (query.status) {
    conditions.push(eq(chatConversations.status, query.status));
  }
  const rows = await db
    .select()
    .from(chatConversations)
    .where(and(...conditions))
    .orderBy(desc(chatConversations.lastActivityAt))
    .limit(limit);
  return { conversations: rows.map(mapConversation) };
}

export async function getChatConversation(
  workspaceId: string,
  conversationId: string,
): Promise<ChatConversationDetail | null> {
  const [row] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.workspaceId, workspaceId),
        eq(chatConversations.id, conversationId),
        isNull(chatConversations.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  const messages = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.conversationId, conversationId),
      ),
    )
    .orderBy(asc(chatMessages.createdAt));

  // Opening a thread clears unread.
  if (row.unread) {
    await db
      .update(chatConversations)
      .set({ unread: false, updatedAt: new Date() })
      .where(eq(chatConversations.id, row.id));
    row.unread = false;
  }

  return {
    ...mapConversation(row),
    messages: messages.map(mapMessage),
  };
}

export async function createChatMessage(
  workspaceId: string,
  conversationId: string,
  input: CreateChatMessageInput,
): Promise<ChatMessage> {
  const credentials = await getChatwootCredentials(workspaceId);
  if (!credentials) {
    throw new Error("Chatwoot is not configured.");
  }
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.workspaceId, workspaceId),
        eq(chatConversations.id, conversationId),
        isNull(chatConversations.deletedAt),
      ),
    )
    .limit(1);
  if (!conversation) {
    throw Object.assign(new Error("Conversation not found"), { status: 404 });
  }

  const client = createChatwootClient(credentials);
  const remote = await client.createMessage(conversation.externalId, {
    content: input.content,
    private: input.private,
  });
  const { message } = await upsertMessageFromChatwoot(
    workspaceId,
    conversation.id,
    remote,
  );
  await db
    .update(chatConversations)
    .set({
      lastMessagePreview: remote.content.slice(0, 280),
      lastActivityAt: new Date(remote.createdAt),
      unread: false,
      updatedAt: new Date(),
    })
    .where(eq(chatConversations.id, conversation.id));

  publishChatUpdated({
    workspaceId,
    conversationId: conversation.id,
    messageId: message.id,
    kind: "message",
  });
  nudgeChatTwin(workspaceId, conversation.id, "chat.message.create");

  return mapMessage(message);
}

export async function toggleChatTyping(
  workspaceId: string,
  conversationId: string,
  typing: boolean,
): Promise<{ ok: boolean }> {
  const credentials = await getChatwootCredentials(workspaceId);
  if (!credentials) {
    throw new Error("Chatwoot is not configured.");
  }
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.workspaceId, workspaceId),
        eq(chatConversations.id, conversationId),
        isNull(chatConversations.deletedAt),
      ),
    )
    .limit(1);
  if (!conversation) {
    throw Object.assign(new Error("Conversation not found"), { status: 404 });
  }

  const client = createChatwootClient(credentials);
  await client.toggleTypingStatus(conversation.externalId, typing);
  return { ok: true };
}

export async function updateChatConversation(
  workspaceId: string,
  conversationId: string,
  input: UpdateChatConversationInput,
): Promise<ChatConversation> {
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.workspaceId, workspaceId),
        eq(chatConversations.id, conversationId),
        isNull(chatConversations.deletedAt),
      ),
    )
    .limit(1);
  if (!conversation) {
    throw Object.assign(new Error("Conversation not found"), { status: 404 });
  }

  const patch: {
    status?: string;
    assigneeId?: string | null;
    priority?: number;
    dueDate?: Date | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  let touched = false;

  if (input.status) {
    const credentials = await getChatwootCredentials(workspaceId);
    if (!credentials) {
      throw new Error("Chatwoot is not configured.");
    }
    const client = createChatwootClient(credentials);
    const remote = await client.toggleConversationStatus(
      conversation.externalId,
      input.status,
    );
    patch.status = normalizeStatus(remote?.status ?? input.status);
    touched = true;
  }
  if (input.assigneeId !== undefined) {
    patch.assigneeId = input.assigneeId;
    touched = true;
  }
  if (input.priority !== undefined) {
    patch.priority = input.priority;
    touched = true;
  }
  if (input.dueDate !== undefined) {
    patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    touched = true;
  }

  if (!touched) {
    return mapConversation(conversation);
  }

  const [updated] = await db
    .update(chatConversations)
    .set(patch)
    .where(eq(chatConversations.id, conversation.id))
    .returning();
  publishChatUpdated({
    workspaceId,
    conversationId: conversation.id,
    messageId: null,
    kind: "conversation",
  });
  nudgeChatTwin(workspaceId, conversation.id, "chat.conversation.update");
  return mapConversation(updated!);
}

export async function syncChatwootConversations(
  workspaceId: string,
): Promise<ChatSyncResult> {
  const credentials = await getChatwootCredentials(workspaceId);
  if (!credentials) {
    throw new Error("Chatwoot is not configured.");
  }
  const client = createChatwootClient(credentials);
  const inboxes = await client.listInboxes();
  const inboxNameById = new Map(inboxes.map((inbox) => [inbox.id, inbox.name]));
  // Portal chat for v1: Website / WebWidget and Chatwoot API inboxes
  // (client.lemo-design.com uses Channel::Api). Skip WhatsApp.
  const websiteInboxIds = new Set(
    inboxes
      .filter((inbox) => {
        const channel = (inbox.channelType ?? "").toLowerCase();
        if (!channel) return true;
        if (channel.includes("whatsapp")) return false;
        return (
          channel.includes("web") ||
          channel.includes("widget") ||
          channel.includes("website") ||
          channel.includes("api") ||
          channel.includes("channel::webwidget") ||
          channel.includes("channel::api")
        );
      })
      .map((inbox) => inbox.id),
  );

  let imported = 0;
  let updated = 0;
  const remoteConversations = await client.listConversations({ status: "open" });
  for (const summary of remoteConversations) {
    if (
      websiteInboxIds.size > 0 &&
      summary.inboxId &&
      !websiteInboxIds.has(summary.inboxId)
    ) {
      continue;
    }
    const { conversation, created } = await upsertConversationFromChatwoot(
      workspaceId,
      summary,
      {
        inboxName: summary.inboxId
          ? (inboxNameById.get(summary.inboxId) ?? null)
          : null,
      },
    );
    if (created) imported += 1;
    else updated += 1;

    try {
      const messages = await client.listMessages(summary.id);
      for (const message of messages) {
        await upsertMessageFromChatwoot(workspaceId, conversation.id, message);
      }
      if (messages.length > 0) {
        const last = messages[messages.length - 1]!;
        await db
          .update(chatConversations)
          .set({
            lastMessagePreview: last.content.slice(0, 280),
            lastActivityAt: new Date(last.createdAt),
            updatedAt: new Date(),
          })
          .where(eq(chatConversations.id, conversation.id));
      }
    } catch (error) {
      if (!(error instanceof ChatwootApiError && error.status === 404)) {
        throw error;
      }
    }
  }

  if (imported + updated > 0) {
    notifyPeerOfEntityWrite({
      workspaceId,
      entity: "chat_conversation",
      entityId: workspaceId,
      reason: "chat.sync",
      operation: "upsert",
    });
  }
  return { imported, updated };
}

async function rememberDelivery(
  workspaceId: string,
  deliveryId: string,
  eventType: string | null,
): Promise<boolean> {
  const key = deliveryId.trim();
  if (!key) return false;
  const [existing] = await db
    .select({ id: chatWebhookEvents.id })
    .from(chatWebhookEvents)
    .where(eq(chatWebhookEvents.deliveryId, key))
    .limit(1);
  if (existing) return true;
  try {
    await db.insert(chatWebhookEvents).values({
      id: newId(),
      workspaceId,
      deliveryId: key,
      eventType,
      processedAt: new Date(),
    });
    return false;
  } catch {
    // Unique race — treat as duplicate.
    return true;
  }
}

function summaryFromWebhookConversation(
  payload: unknown,
): ChatwootConversationSummary | null {
  return parseChatwootConversationFromWebhookPayload(payload);
}

function summaryFromWebhookMessage(
  payload: unknown,
): ChatwootMessageSummary | null {
  return parseChatwootMessagePayload(payload);
}

async function ingestWebhookForWorkspace(
  workspaceId: string,
  payload: unknown,
): Promise<{ published: boolean }> {
  const parsed = parseChatwootWebhookPayload(payload);
  if (!parsed) return { published: false };

  if (
    parsed.event === "message_created" ||
    parsed.event === "message_updated"
  ) {
    const message = summaryFromWebhookMessage(payload);
    const conversationSummary = summaryFromWebhookConversation(payload);
    if (!message || !conversationSummary) return { published: false };

    const { conversation } = await upsertConversationFromChatwoot(
      workspaceId,
      conversationSummary,
      {
        markUnread: message.messageType === "incoming",
        lastMessagePreview: message.content.slice(0, 280),
      },
    );
    const { message: stored } = await upsertMessageFromChatwoot(
      workspaceId,
      conversation.id,
      message,
    );
    publishChatUpdated({
      workspaceId,
      conversationId: conversation.id,
      messageId: stored.id,
      kind: "message",
    });
    nudgeChatTwin(workspaceId, conversation.id, "chat.webhook.message");
    return { published: true };
  }

  if (
    parsed.event === "conversation_created" ||
    parsed.event === "conversation_updated" ||
    parsed.event === "conversation_status_changed"
  ) {
    const conversationSummary = summaryFromWebhookConversation(payload);
    if (!conversationSummary) return { published: false };
    const { conversation } = await upsertConversationFromChatwoot(
      workspaceId,
      conversationSummary,
    );
    publishChatUpdated({
      workspaceId,
      conversationId: conversation.id,
      messageId: null,
      kind: "conversation",
    });
    nudgeChatTwin(workspaceId, conversation.id, "chat.webhook.conversation");
    return { published: true };
  }

  if (
    parsed.event === "conversation_typing_on" ||
    parsed.event === "conversation_typing_off"
  ) {
    // Private-note typing is agent-only chrome — ignore for the inbox badge.
    const record = chatwootAsRecord(payload);
    if (record?.is_private === true) return { published: false };
    const externalId = parsed.conversationId?.trim();
    if (!externalId) return { published: false };
    const conversation = await findConversationByExternalId(
      workspaceId,
      externalId,
    );
    if (!conversation || conversation.deletedAt) return { published: false };
    const typing = parsed.event === "conversation_typing_on";
    publishChatTyping({
      workspaceId,
      conversationId: conversation.id,
      typing,
    });
    // Ephemeral — no DB row to twin; nudge the peer so local SSE sees it.
    nudgeChatTwin(
      workspaceId,
      conversation.id,
      typing ? "chat.webhook.typing_on" : "chat.webhook.typing_off",
    );
    return { published: true };
  }

  return { published: false };
}

/**
 * Verify signature against stored secrets, dedupe by delivery id, mirror Tier C.
 */
export async function handleChatwootWebhookDelivery(input: {
  rawBody: string;
  headers: ChatwootWebhookHeaders;
  secrets?: ChatwootWebhookSecretRow[];
}): Promise<{ ok: boolean; published: boolean; workspaceId: string | null }> {
  const secrets = input.secrets ?? (await listChatwootWebhookSecrets());
  if (secrets.length === 0) {
    return { ok: false, published: false, workspaceId: null };
  }

  let matched: ChatwootWebhookSecretRow | null = null;
  for (const row of secrets) {
    if (
      verifyChatwootWebhookSignature(row.secret, input.rawBody, input.headers)
    ) {
      matched = row;
      break;
    }
  }
  if (!matched) {
    return { ok: false, published: false, workspaceId: null };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody) as unknown;
  } catch {
    return { ok: false, published: false, workspaceId: matched.workspaceId };
  }

  const parsed = parseChatwootWebhookPayload(payload);
  if (
    matched.accountId &&
    parsed?.accountId &&
    matched.accountId !== parsed.accountId
  ) {
    return { ok: false, published: false, workspaceId: matched.workspaceId };
  }

  const deliveryId =
    extractChatwootDeliveryId(input.headers, payload) ??
    [
      parsed?.event ?? "event",
      parsed?.conversationId ?? "c",
      parsed?.messageId ?? chatwootAsString(chatwootAsRecord(payload)?.id) ?? "m",
      chatwootUnixOrIsoToIso(chatwootAsRecord(payload)?.created_at) ??
        String(Date.now()),
    ].join(":");

  const duplicate = await rememberDelivery(
    matched.workspaceId,
    deliveryId,
    parsed?.event ?? null,
  );
  if (duplicate) {
    return { ok: true, published: false, workspaceId: matched.workspaceId };
  }

  const result = await ingestWebhookForWorkspace(matched.workspaceId, payload);
  return {
    ok: true,
    published: result.published,
    workspaceId: matched.workspaceId,
  };
}

/** Exported for unit tests that build synthetic Chatwoot payloads. */
export {
  mapConversation,
  mapMessage,
  normalizeStatus,
  mapChatwootMessageType,
};
