import { and, asc, desc, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";

import { letterAttachments, letters } from "../../db/schema.js";
import { db } from "../../db/index.js";
import {
  decodeUpdatedAtCursor,
  encodeUpdatedAtCursor,
  type ParsedLettersListQuery,
} from "../../lib/list-query.js";
import { newId } from "../../lib/crypto.js";
import {
  contactExists,
  type DbExecutor,
  organizationExists,
  projectExists,
  resolveEntityNumber,
} from "./shared.js";
import {
  assertPrivateStorageKey,
  buildLetterPdfStorageKey,
  checksumForContent,
  deleteObject,
  getObject,
  letterPdfSubjectFromFilename,
  moveObject,
  putObject,
} from "../../lib/storage.js";
type LetterInput = {
  number?: number | null;
  projectId?: string | null;
  organizationId?: string | null;
  contactId?: string | null;
  title: string;
  icon?: string | null;
  context?: string | null;
  status?: string;
  dueDate?: string | null;
  receivedDate?: string | null;
  direction?: string;
  originalFilename?: string;
  storageKey?: string;
  contentType?: string;
  byteSize?: number;
  checksum?: string | null;
  contentEtag?: string | null;
  extractedText?: string | null;
  sortOrder?: number;
};

export function listLetters(
  workspaceId: string,
  filters: {
    projectId?: string;
    organizationId?: string;
    contactId?: string;
    status?: string;
    triage?: boolean;
    updatedSince?: Date;
  } = {},
) {
  const conditions = [eq(letters.workspaceId, workspaceId)];
  if (filters.updatedSince) {
    conditions.push(gte(letters.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(letters.deletedAt));
  }
  if (filters.projectId) conditions.push(eq(letters.projectId, filters.projectId));
  if (filters.organizationId) conditions.push(eq(letters.organizationId, filters.organizationId));
  if (filters.contactId) conditions.push(eq(letters.contactId, filters.contactId));
  if (filters.status) conditions.push(eq(letters.status, filters.status));
  if (filters.triage) conditions.push(eq(letters.status, "triage"));
  return db
    .select()
    .from(letters)
    .where(and(...conditions))
    .orderBy(asc(letters.sortOrder), desc(letters.receivedDate), desc(letters.updatedAt));
}

export async function listLettersPaginated(
  workspaceId: string,
  filters: ParsedLettersListQuery,
  nowMs: number = Date.now(),
) {
  const conditions: SQL[] = [eq(letters.workspaceId, workspaceId)];
  if (filters.updatedSince) {
    conditions.push(gte(letters.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(letters.deletedAt));
  }
  if (filters.projectId) conditions.push(eq(letters.projectId, filters.projectId));
  if (filters.organizationId) {
    conditions.push(eq(letters.organizationId, filters.organizationId));
  }
  if (filters.contactId) conditions.push(eq(letters.contactId, filters.contactId));
  if (filters.status) conditions.push(eq(letters.status, filters.status));
  if (filters.triage) conditions.push(eq(letters.status, "triage"));
  if (filters.cursor?.trim()) {
    const cursor = decodeUpdatedAtCursor(filters.cursor, nowMs);
    conditions.push(
      sql`(
        date_trunc('milliseconds', ${letters.updatedAt}) < date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
        OR (
          date_trunc('milliseconds', ${letters.updatedAt}) = date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
          AND ${letters.id} > ${cursor.id}
        )
      )`,
    );
  }
  const rows = await db
    .select()
    .from(letters)
    .where(and(...conditions))
    .orderBy(
      sql`date_trunc('milliseconds', ${letters.updatedAt}) desc`,
      asc(letters.id),
    )
    .limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const page = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor:
      hasMore && last
        ? encodeUpdatedAtCursor(
            { id: last.id, updatedAt: last.updatedAt },
            nowMs,
          )
        : null,
  };
}

export async function createLetter(
  workspaceId: string,
  input: LetterInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  if (input.projectId && !(await projectExists(workspaceId, input.projectId, executor))) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (
    input.organizationId &&
    !(await organizationExists(workspaceId, input.organizationId, executor))
  ) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }
  if (input.contactId && !(await contactExists(workspaceId, input.contactId, executor))) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  const number = await resolveEntityNumber(
    workspaceId,
    "letter",
    input.number,
    executor,
  );
  const [row] = await executor
    .insert(letters)
    .values({
      id,
      workspaceId,
      ...input,
      number,
      status: input.status ?? (input.direction !== "outgoing" ? "triage" : "ready_to_start"),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      receivedDate: input.receivedDate ? new Date(input.receivedDate) : null,
      originalFilename: input.originalFilename ?? "",
    })
    .returning();
  return row!;
}

export async function getLetterById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(letters)
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, id), isNull(letters.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function updateLetter(
  workspaceId: string,
  id: string,
  input: Partial<LetterInput>,
  executor: DbExecutor = db,
) {
  if (input.projectId && !(await projectExists(workspaceId, input.projectId, executor))) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (
    input.organizationId &&
    !(await organizationExists(workspaceId, input.organizationId, executor))
  ) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }
  if (input.contactId && !(await contactExists(workspaceId, input.contactId, executor))) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  const shouldRelocatePdfs =
    input.receivedDate !== undefined || input.title !== undefined;
  const titleChanged =
    input.title !== undefined && typeof input.title === "string";
  const [row] = await executor
    .update(letters)
    .set({
      ...input,
      dueDate:
        input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      receivedDate:
        input.receivedDate === undefined
          ? undefined
          : input.receivedDate
            ? new Date(input.receivedDate)
            : null,
      updatedAt: new Date(),
    })
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, id), isNull(letters.deletedAt)))
    .returning();
  if (!row) return null;
  if (shouldRelocatePdfs) {
    // Keep primary PDF tab label aligned with the letter title.
    if (titleChanged) {
      await syncPrimaryLetterAttachmentFilename(
        workspaceId,
        row.id,
        `${row.title.trim() || "Letter"}.pdf`,
        executor,
      );
    }
    await relocateLetterPdfAttachments(workspaceId, row, executor);
    return (await getLetterById(workspaceId, id, executor)) ?? row;
  }
  return row;
}

function attachmentFilingSubject(
  attachment: Pick<typeof letterAttachments.$inferSelect, "originalFilename">,
  letterTitle: string,
): string {
  const fromFilename = attachment.originalFilename?.trim()
    ? letterPdfSubjectFromFilename(attachment.originalFilename)
    : "";
  return fromFilename || letterTitle.trim() || "Letter";
}

async function syncPrimaryLetterAttachmentFilename(
  workspaceId: string,
  letterId: string,
  originalFilename: string,
  executor: DbExecutor = db,
) {
  const attachments = await listLetterAttachments(workspaceId, letterId, executor);
  const primary = attachments?.[0];
  if (!primary) return;
  const filename = originalFilename.trim();
  if (!filename || primary.originalFilename === filename) return;
  await executor
    .update(letterAttachments)
    .set({ originalFilename: filename, updatedAt: new Date() })
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.id, primary.id),
        isNull(letterAttachments.deletedAt),
      ),
    );
}

async function moveLetterAttachmentToKey(
  workspaceId: string,
  attachment: typeof letterAttachments.$inferSelect,
  nextKey: string,
  executor: DbExecutor = db,
): Promise<typeof letterAttachments.$inferSelect | null> {
  if (nextKey === attachment.storageKey) return attachment;
  try {
    await moveObject(attachment.storageKey, nextKey);
  } catch (error) {
    // Keep the existing key when the blob is missing. Updating metadata to a
    // path with no file breaks hybrid cloud→local (cloud has no PDF bytes)
    // and surfaces as 500 "Internal server error" on download.
    if (
      error instanceof Error &&
      error.message === "STORAGE_OBJECT_NOT_FOUND"
    ) {
      console.warn(
        "[api] letter PDF relocate skipped; object missing",
        attachment.storageKey,
        "→",
        nextKey,
      );
      return attachment;
    }
    throw error;
  }
  const [updated] = await executor
    .update(letterAttachments)
    .set({ storageKey: nextKey, updatedAt: new Date() })
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.id, attachment.id),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .returning();
  return updated ?? { ...attachment, storageKey: nextKey };
}

/** Re-file letter PDFs under Letters/YYYY/MM using Received Date (else today). */
async function relocateLetterPdfAttachments(
  workspaceId: string,
  letter: typeof letters.$inferSelect,
  executor: DbExecutor = db,
) {
  const attachments = await listLetterAttachments(workspaceId, letter.id, executor);
  if (!attachments?.length) return;

  let movedPrimary: typeof letterAttachments.$inferSelect | null = null;
  for (const attachment of attachments) {
    const nextKey = buildLetterPdfStorageKey({
      title: letter.title,
      subject: attachmentFilingSubject(attachment, letter.title),
      receivedDate: letter.receivedDate,
      attachmentId: attachment.id,
    });
    const updated = await moveLetterAttachmentToKey(
      workspaceId,
      attachment,
      nextKey,
      executor,
    );
    if (updated && !movedPrimary) movedPrimary = updated;
  }

  const refreshed = await listLetterAttachments(workspaceId, letter.id, executor);
  await syncLetterPrimaryAttachment(
    workspaceId,
    letter.id,
    refreshed?.[0] ?? movedPrimary,
    executor,
  );
}

export async function triageLetter(
  workspaceId: string,
  id: string,
  input: {
    projectId?: string | null;
    organizationId?: string | null;
    contactId?: string | null;
    status?: string;
    dueDate?: string | null;
  },
) {
  return updateLetter(workspaceId, id, {
    ...input,
    status: input.status ?? "ready_to_start",
  });
}

export async function deleteLetter(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(letters)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, id), isNull(letters.deletedAt)))
    .returning();
  return row ?? null;
}

export async function listLetterAttachments(
  workspaceId: string,
  letterId: string,
  executor: DbExecutor = db,
) {
  const letter = await getLetterById(workspaceId, letterId, executor);
  if (!letter) return null;
  return executor
    .select()
    .from(letterAttachments)
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.letterId, letterId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .orderBy(asc(letterAttachments.sortOrder), asc(letterAttachments.createdAt));
}

async function syncLetterPrimaryAttachment(
  workspaceId: string,
  letterId: string,
  attachment: typeof letterAttachments.$inferSelect | null,
  executor: DbExecutor = db,
) {
  await executor
    .update(letters)
    .set({
      storageKey: attachment?.storageKey ?? "",
      originalFilename: attachment?.originalFilename ?? "",
      contentType: attachment?.contentType ?? "application/pdf",
      byteSize: attachment?.byteSize ?? 0,
      checksum: attachment?.checksum ?? null,
      contentEtag: attachment?.contentEtag ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, letterId)));
}

export async function createLetterAttachment(
  workspaceId: string,
  letterId: string,
  bytes: Uint8Array,
  fileName: string,
) {
  const letter = await getLetterById(workspaceId, letterId);
  if (!letter) return null;

  const attachmentId = newId();
  const originalFilename = fileName || "letter.pdf";
  const key = buildLetterPdfStorageKey({
    title: letter.title,
    subject: letterPdfSubjectFromFilename(originalFilename),
    receivedDate: letter.receivedDate,
    attachmentId,
  });
  const stored = await putObject(key, bytes, "application/pdf");
  const [attachment] = await db
    .insert(letterAttachments)
    .values({
      id: attachmentId,
      workspaceId,
      letterId,
      storageKey: key,
      originalFilename,
      contentType: "application/pdf",
      byteSize: stored.byteSize,
      checksum: checksumForContent(bytes),
      contentEtag: stored.etag,
      sortOrder: Date.now(),
    })
    .returning();
  if (!attachment) return null;

  const attachments = await listLetterAttachments(workspaceId, letterId);
  // Keep the first (oldest) attachment as the denormalized primary on `letters`.
  await syncLetterPrimaryAttachment(
    workspaceId,
    letterId,
    attachments?.[0] ?? attachment,
  );
  const updatedLetter = await getLetterById(workspaceId, letterId);
  return { letter: updatedLetter!, attachment };
}

/** @deprecated Prefer createLetterAttachment — still adds a PDF (no longer replaces). */
export async function putLetterPdf(
  workspaceId: string,
  id: string,
  bytes: Uint8Array,
  fileName: string,
) {
  const result = await createLetterAttachment(workspaceId, id, bytes, fileName);
  return result?.letter ?? null;
}

async function readLetterAttachmentObject(
  workspaceId: string,
  row: typeof letterAttachments.$inferSelect,
  letter?: typeof letters.$inferSelect | null,
) {
  assertPrivateStorageKey(workspaceId, row.storageKey);
  try {
    const object = await getObject(row.storageKey);
    return { row, bytes: object.bytes };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "STORAGE_OBJECT_NOT_FOUND"
    ) {
      throw error;
    }
  }

  // Heal stale keys (e.g. cloud renamed filing path without the local blob).
  const letterRow =
    letter ?? (await getLetterById(workspaceId, row.letterId));
  const fallbackKeys = [
    letterRow?.storageKey,
    letterRow
      ? buildLetterPdfStorageKey({
          title: letterRow.title,
          subject: attachmentFilingSubject(row, letterRow.title),
          receivedDate: letterRow.receivedDate,
          attachmentId: row.id,
        })
      : null,
    letterRow
      ? buildLetterPdfStorageKey({
          title: letterRow.title,
          receivedDate: letterRow.receivedDate,
          attachmentId: row.id,
        })
      : null,
  ].filter(
    (key): key is string =>
      Boolean(key) && key !== row.storageKey,
  );

  for (const key of fallbackKeys) {
    try {
      assertPrivateStorageKey(workspaceId, key);
      const object = await getObject(key);
      const [healed] = await db
        .update(letterAttachments)
        .set({ storageKey: key, updatedAt: new Date() })
        .where(
          and(
            eq(letterAttachments.workspaceId, workspaceId),
            eq(letterAttachments.id, row.id),
            isNull(letterAttachments.deletedAt),
          ),
        )
        .returning();
      const nextRow = healed ?? { ...row, storageKey: key };
      await syncLetterPrimaryAttachment(workspaceId, row.letterId, nextRow);
      console.warn(
        "[api] healed letter attachment storage key",
        row.storageKey,
        "→",
        key,
      );
      return { row: nextRow, bytes: object.bytes };
    } catch (fallbackError) {
      if (
        fallbackError instanceof Error &&
        fallbackError.message === "STORAGE_OBJECT_NOT_FOUND"
      ) {
        continue;
      }
      throw fallbackError;
    }
  }

  throw new Error("STORAGE_OBJECT_NOT_FOUND");
}

export async function getLetterAttachment(
  workspaceId: string,
  letterId: string,
  attachmentId: string,
) {
  const [row] = await db
    .select()
    .from(letterAttachments)
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.letterId, letterId),
        eq(letterAttachments.id, attachmentId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .limit(1);
  if (!row?.storageKey) return null;
  return readLetterAttachmentObject(workspaceId, row);
}

export async function getLetterPdf(workspaceId: string, id: string) {
  const attachments = await listLetterAttachments(workspaceId, id);
  if (!attachments) return null;
  const primary = attachments[0];
  if (primary) {
    return getLetterAttachment(workspaceId, id, primary.id);
  }

  // Legacy fallback for letters not yet backfilled.
  const [row] = await db
    .select()
    .from(letters)
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, id), isNull(letters.deletedAt)))
    .limit(1);
  if (!row?.storageKey) return null;
  assertPrivateStorageKey(workspaceId, row.storageKey);
  try {
    const object = await getObject(row.storageKey);
    return { row, bytes: object.bytes };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STORAGE_OBJECT_NOT_FOUND"
    ) {
      return null;
    }
    throw error;
  }
}

export async function deleteLetterAttachment(
  workspaceId: string,
  letterId: string,
  attachmentId: string,
) {
  const [row] = await db
    .update(letterAttachments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.letterId, letterId),
        eq(letterAttachments.id, attachmentId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .returning();
  if (!row) return null;

  // Soft-delete keeps Tier B sync tombstones; still drop the blob so storage
  // does not retain PDFs the user removed from the letter.
  if (row.storageKey) {
    try {
      assertPrivateStorageKey(workspaceId, row.storageKey);
      await deleteObject(row.storageKey);
    } catch (error) {
      console.error(
        "[api] failed to delete letter attachment object",
        row.storageKey,
        error,
      );
    }
  }

  const remaining = await listLetterAttachments(workspaceId, letterId);
  await syncLetterPrimaryAttachment(
    workspaceId,
    letterId,
    remaining?.[0] ?? null,
  );
  return row;
}

export async function updateLetterAttachment(
  workspaceId: string,
  letterId: string,
  attachmentId: string,
  input: { originalFilename: string },
) {
  const filename = input.originalFilename.trim();
  if (!filename) return null;

  const letter = await getLetterById(workspaceId, letterId);
  if (!letter) return null;

  const [current] = await db
    .select()
    .from(letterAttachments)
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.letterId, letterId),
        eq(letterAttachments.id, attachmentId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .limit(1);
  if (!current) return null;

  const subject = letterPdfSubjectFromFilename(filename);
  const nextKey = buildLetterPdfStorageKey({
    title: letter.title,
    subject,
    receivedDate: letter.receivedDate,
    attachmentId: current.id,
  });
  const moved =
    (await moveLetterAttachmentToKey(workspaceId, current, nextKey)) ?? current;

  const [row] = await db
    .update(letterAttachments)
    .set({
      originalFilename: filename,
      storageKey: moved.storageKey,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.id, attachmentId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .returning();
  if (!row) return null;

  const attachments = await listLetterAttachments(workspaceId, letterId);
  const primary = attachments?.[0];
  const isPrimary = primary?.id === attachmentId;
  if (isPrimary) {
    // Letter title follows the primary PDF name so vault browsing stays clear.
    if (letter.title !== subject) {
      await db
        .update(letters)
        .set({ title: subject, updatedAt: new Date() })
        .where(
          and(
            eq(letters.workspaceId, workspaceId),
            eq(letters.id, letterId),
            isNull(letters.deletedAt),
          ),
        );
    }
    await syncLetterPrimaryAttachment(workspaceId, letterId, row);
  }
  return row;
}

export async function reorderLetterAttachments(
  workspaceId: string,
  letterId: string,
  orderedIds: string[],
) {
  const letter = await getLetterById(workspaceId, letterId);
  if (!letter) return null;

  const uniqueIds = [...new Set(orderedIds)];
  if (uniqueIds.length !== orderedIds.length) {
    throw new Error("ATTACHMENT_IDS_INVALID");
  }

  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: letterAttachments.id })
      .from(letterAttachments)
      .where(
        and(
          eq(letterAttachments.workspaceId, workspaceId),
          eq(letterAttachments.letterId, letterId),
          inArray(letterAttachments.id, orderedIds),
          isNull(letterAttachments.deletedAt),
        ),
      );
    if (owned.length !== orderedIds.length) {
      throw new Error("ATTACHMENT_NOT_FOUND");
    }

    const rows = [];
    for (const [index, id] of orderedIds.entries()) {
      const [row] = await tx
        .update(letterAttachments)
        .set({ sortOrder: index + 1, updatedAt: new Date() })
        .where(
          and(
            eq(letterAttachments.workspaceId, workspaceId),
            eq(letterAttachments.letterId, letterId),
            eq(letterAttachments.id, id),
            isNull(letterAttachments.deletedAt),
          ),
        )
        .returning();
      if (row) rows.push(row);
    }

    const primary = rows[0] ?? null;
    await tx
      .update(letters)
      .set({
        storageKey: primary?.storageKey ?? "",
        originalFilename: primary?.originalFilename ?? "",
        contentType: primary?.contentType ?? "application/pdf",
        byteSize: primary?.byteSize ?? 0,
        checksum: primary?.checksum ?? null,
        contentEtag: primary?.contentEtag ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, letterId)));

    return rows;
  });
}
