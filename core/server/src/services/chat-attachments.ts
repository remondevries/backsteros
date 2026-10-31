import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { ChatThreadAttachment } from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  chatThreadAttachments,
  chatThreads,
  type DbChatThreadAttachment,
} from "../db/schema.js";
import {
  chatAttachmentDownloadUrl,
  MAX_CHAT_ATTACHMENT_BYTES,
  resolveChatAttachmentContentType,
  type ChatAttachmentKind,
} from "../lib/chat-attachment-content-type.js";
import { newId } from "../lib/crypto.js";
import {
  assertPrivateStorageKey,
  buildChatAttachmentStorageKey,
  checksumForContent,
  getObject,
  putObject,
} from "../lib/storage.js";

function badRequest(message: string): Error {
  return Object.assign(new Error(message), {
    status: 400,
    code: "bad_request",
  });
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), {
    status: 404,
    code: "not_found",
  });
}

function toKind(value: string): ChatAttachmentKind {
  if (value === "image" || value === "pdf") return value;
  return "file";
}

export function toChatThreadAttachment(
  row: DbChatThreadAttachment,
): ChatThreadAttachment {
  const url = chatAttachmentDownloadUrl(row.threadId, row.id);
  const kind = toKind(row.kind);
  return {
    id: row.id,
    filename: row.originalFilename,
    mime: row.contentType,
    size: row.byteSize,
    url,
    thumbnailUrl: kind === "image" ? url : null,
    kind,
  };
}

async function assertThread(
  workspaceId: string,
  threadId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.workspaceId, workspaceId),
        eq(chatThreads.id, threadId),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Thread");
}

export async function uploadChatThreadAttachment(
  workspaceId: string,
  threadId: string,
  bytes: Uint8Array,
  fileName: string,
  declaredContentType: string | null | undefined,
): Promise<ChatThreadAttachment> {
  await assertThread(workspaceId, threadId);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CHAT_ATTACHMENT_BYTES) {
    throw badRequest("Attachment must be between 1 byte and 25 MB");
  }
  const originalFilename = fileName.trim() || "attachment.bin";
  if (!originalFilename) {
    throw badRequest("X-Filename is required");
  }
  const { contentType, kind } = resolveChatAttachmentContentType(
    declaredContentType,
    originalFilename,
    bytes,
  );
  const attachmentId = newId();
  const key = buildChatAttachmentStorageKey(
    threadId,
    attachmentId,
    originalFilename,
  );
  const stored = await putObject(key, bytes, contentType);
  const now = new Date();
  const [row] = await db
    .insert(chatThreadAttachments)
    .values({
      id: attachmentId,
      workspaceId,
      threadId,
      messageId: null,
      storageKey: key,
      originalFilename,
      contentType,
      byteSize: stored.byteSize,
      checksum: checksumForContent(bytes),
      contentEtag: stored.etag,
      kind,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw badRequest("Could not store attachment");
  return toChatThreadAttachment(row);
}

export async function getChatThreadAttachmentBytes(
  workspaceId: string,
  threadId: string,
  attachmentId: string,
): Promise<{ row: DbChatThreadAttachment; bytes: Uint8Array } | null> {
  const [row] = await db
    .select()
    .from(chatThreadAttachments)
    .where(
      and(
        eq(chatThreadAttachments.workspaceId, workspaceId),
        eq(chatThreadAttachments.threadId, threadId),
        eq(chatThreadAttachments.id, attachmentId),
        isNull(chatThreadAttachments.deletedAt),
      ),
    )
    .limit(1);
  if (!row?.storageKey) return null;
  assertPrivateStorageKey(workspaceId, row.storageKey);
  const object = await getObject(row.storageKey);
  return { row, bytes: object.bytes };
}

export async function listAttachmentsForMessages(
  workspaceId: string,
  messageIds: readonly string[],
): Promise<Map<string, ChatThreadAttachment[]>> {
  const map = new Map<string, ChatThreadAttachment[]>();
  if (messageIds.length === 0) return map;
  const rows = await db
    .select()
    .from(chatThreadAttachments)
    .where(
      and(
        eq(chatThreadAttachments.workspaceId, workspaceId),
        inArray(chatThreadAttachments.messageId, [...messageIds]),
        isNull(chatThreadAttachments.deletedAt),
      ),
    )
    .orderBy(asc(chatThreadAttachments.createdAt));
  for (const row of rows) {
    if (!row.messageId) continue;
    const list = map.get(row.messageId) ?? [];
    list.push(toChatThreadAttachment(row));
    map.set(row.messageId, list);
  }
  return map;
}

/**
 * Claim previously uploaded attachments for a message.
 * Attachments must belong to the thread, be unlinked, and match ids exactly.
 */
export async function linkAttachmentsToMessage(
  workspaceId: string,
  threadId: string,
  messageId: string,
  attachmentIds: readonly string[],
): Promise<ChatThreadAttachment[]> {
  if (attachmentIds.length === 0) return [];
  const unique = [...new Set(attachmentIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length !== attachmentIds.length) {
    throw badRequest("Duplicate attachment ids");
  }
  if (unique.length > 20) {
    throw badRequest("At most 20 attachments per message");
  }

  const rows = await db
    .select()
    .from(chatThreadAttachments)
    .where(
      and(
        eq(chatThreadAttachments.workspaceId, workspaceId),
        eq(chatThreadAttachments.threadId, threadId),
        inArray(chatThreadAttachments.id, unique),
        isNull(chatThreadAttachments.deletedAt),
      ),
    );

  if (rows.length !== unique.length) {
    throw badRequest("One or more attachments were not found on this thread");
  }
  for (const row of rows) {
    if (row.messageId != null) {
      throw badRequest("Attachment is already linked to a message");
    }
  }

  const now = new Date();
  await db
    .update(chatThreadAttachments)
    .set({ messageId, updatedAt: now })
    .where(
      and(
        eq(chatThreadAttachments.workspaceId, workspaceId),
        eq(chatThreadAttachments.threadId, threadId),
        inArray(chatThreadAttachments.id, unique),
        isNull(chatThreadAttachments.messageId),
      ),
    );

  // Preserve caller order.
  const byId = new Map(rows.map((row) => [row.id, row]));
  return unique.map((id) => toChatThreadAttachment(byId.get(id)!));
}
