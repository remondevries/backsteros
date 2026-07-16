import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import type {
  CreateDocumentInput,
  DocumentType,
  UpdateDocumentContentInput,
  UpdateDocumentInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { documents } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  buildStorageKey,
  checksumForContent,
  deleteObject,
  getObject,
  putObject,
  snippetForContent,
} from "../lib/storage.js";
import { getProjectById } from "./tasks-projects.js";

const DEFAULT_CONTENT_TYPE = "text/markdown; charset=utf-8";
type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

async function getDocumentRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.id, id),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findDocumentByPath(
  workspaceId: string,
  type: DocumentType,
  path: string,
  projectId?: string | null,
  executor: DbExecutor = db,
) {
  const conditions = [
    eq(documents.workspaceId, workspaceId),
    eq(documents.type, type),
    eq(documents.path, path),
    isNull(documents.deletedAt),
  ];

  if (type === "project") {
    conditions.push(eq(documents.projectId, projectId ?? ""));
  } else {
    conditions.push(sql`${documents.projectId} IS NULL`);
  }

  const [row] = await executor
    .select()
    .from(documents)
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

export async function listDocuments(
  workspaceId: string,
  filters?: {
    type?: DocumentType;
    projectId?: string;
  },
  executor: DbExecutor = db,
) {
  const conditions = [
    eq(documents.workspaceId, workspaceId),
    isNull(documents.deletedAt),
  ];

  if (filters?.type) {
    conditions.push(eq(documents.type, filters.type));
  }

  if (filters?.projectId) {
    conditions.push(eq(documents.projectId, filters.projectId));
  }

  return executor
    .select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt));
}

export async function getDocumentById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  return getDocumentRow(workspaceId, id, executor);
}

export async function createDocument(
  workspaceId: string,
  input: CreateDocumentInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  let projectKey: string | undefined;

  if (input.type === "project") {
    const project = await getProjectById(
      workspaceId,
      input.projectId!,
      executor,
    );
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    projectKey = project.key;
  }

  const existing = await findDocumentByPath(
    workspaceId,
    input.type,
    input.path,
    input.projectId ?? null,
    executor,
  );
  if (existing) {
    throw new Error("DOCUMENT_PATH_EXISTS");
  }

  const storageKey = buildStorageKey(
    input.type,
    input.path,
    projectKey,
    workspaceId,
  );
  const content = input.content ?? "";

  let byteSize = 0;
  let checksum: string | null = null;
  let snippet: string | null = null;
  let contentEtag: string | null = null;
  let contentVersion = 1;

  if (content.length > 0) {
    try {
      const stored = await putObject(storageKey, content);
      byteSize = stored.byteSize;
      contentEtag = stored.etag;
      checksum = checksumForContent(content);
      snippet = snippetForContent(content);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "Code" in error &&
        error.Code === "AccessDenied"
      ) {
        throw new Error("STORAGE_ACCESS_DENIED");
      }
      throw error;
    }
  }

  const [row] = await executor
    .insert(documents)
    .values({
      id,
      workspaceId,
      type: input.type,
      projectId: input.projectId ?? null,
      parentId: input.parentId ?? null,
      kind: input.kind ?? "document",
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? 0,
      journalDate:
        input.journalDate ??
        (input.type === "journal" ? new Date().toISOString().slice(0, 10) : null),
      path: input.path,
      title: input.title,
      storageKey,
      contentType: DEFAULT_CONTENT_TYPE,
      byteSize,
      checksum,
      snippet,
      contentVersion,
      contentEtag,
    })
    .returning();

  return row;
}

export async function updateDocument(
  workspaceId: string,
  id: string,
  input: UpdateDocumentInput,
  executor: DbExecutor = db,
) {
  const existing = await getDocumentRow(workspaceId, id, executor);
  if (!existing) {
    return null;
  }

  if (input.path && input.path !== existing.path) {
    const conflict = await findDocumentByPath(
      workspaceId,
      existing.type as DocumentType,
      input.path,
      existing.projectId,
      executor,
    );
    if (conflict) {
      throw new Error("DOCUMENT_PATH_EXISTS");
    }
  }

  const [row] = await executor
    .update(documents)
    .set({
      title: input.title,
      path: input.path,
      parentId: input.parentId,
      icon: input.icon,
      sortOrder: input.sortOrder,
      journalDate: input.journalDate,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
    .returning();

  return row ?? null;
}

export async function deleteDocument(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const existing = await getDocumentRow(workspaceId, id, executor);
  if (!existing) {
    return null;
  }

  const [row] = await executor
    .update(documents)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
    .returning();

  return row ?? null;
}

export async function getDocumentContent(workspaceId: string, id: string) {
  const row = await getDocumentRow(workspaceId, id);
  if (!row) {
    return null;
  }

  if (row.byteSize === 0) {
    return {
      row,
      content: "",
    };
  }

  try {
    const object = await getObject(row.storageKey);
    return {
      row,
      content: object.body,
    };
  } catch {
    throw new Error("STORAGE_OBJECT_NOT_FOUND");
  }
}

export async function getOrCreateJournalDocument(
  workspaceId: string,
  journalDate: string,
) {
  const existing = await getJournalDocument(workspaceId, journalDate);
  if (existing) return existing;
  return createDocument(workspaceId, {
    type: "journal",
    path: `${journalDate}.md`,
    title: journalDate,
    journalDate,
  });
}

export async function getJournalDocument(
  workspaceId: string,
  journalDate: string,
) {
  const [existing] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.type, "journal"),
        eq(documents.journalDate, journalDate),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  return existing ?? null;
}

export async function moveDocument(
  workspaceId: string,
  id: string,
  parentId: string | null,
) {
  if (parentId === id) throw new Error("INVALID_PARENT");
  if (parentId) {
    const parent = await getDocumentRow(workspaceId, parentId);
    if (!parent || parent.kind !== "folder") throw new Error("FOLDER_NOT_FOUND");
  }
  const [row] = await db
    .update(documents)
    .set({ parentId, updatedAt: new Date() })
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.id, id),
        isNull(documents.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function reorderDocuments(workspaceId: string, orderedIds: string[]) {
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          inArray(documents.id, orderedIds),
          isNull(documents.deletedAt),
        ),
      );
    if (owned.length !== new Set(orderedIds).size) throw new Error("DOCUMENT_NOT_FOUND");
    const rows = [];
    for (const [sortOrder, id] of orderedIds.entries()) {
      const [row] = await tx
        .update(documents)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
        .returning();
      if (row) rows.push(row);
    }
    return rows;
  });
}

export async function updateDocumentContent(
  workspaceId: string,
  id: string,
  input: UpdateDocumentContentInput,
) {
  const row = await getDocumentRow(workspaceId, id);
  if (!row) {
    return null;
  }

  if (
    input.ifMatchVersion !== undefined &&
    input.ifMatchVersion !== row.contentVersion
  ) {
    throw new Error("CONTENT_VERSION_CONFLICT");
  }

  try {
    const stored = await putObject(row.storageKey, input.content);
    const checksum = checksumForContent(input.content);
    const snippet = snippetForContent(input.content);
    const contentVersion = row.contentVersion + 1;

    const [updated] = await db
      .update(documents)
      .set({
        byteSize: stored.byteSize,
        checksum,
        snippet,
        contentVersion,
        contentEtag: stored.etag,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
      .returning();

    return updated ?? null;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "Code" in error &&
      error.Code === "AccessDenied"
    ) {
      throw new Error("STORAGE_ACCESS_DENIED");
    }
    throw error;
  }
}

export async function searchDocuments(input: {
  workspaceId: string;
  q: string;
  type?: DocumentType;
  projectId?: string;
  limit?: number;
}) {
  const pattern = `%${input.q}%`;
  const conditions = [
    eq(documents.workspaceId, input.workspaceId),
    isNull(documents.deletedAt),
    or(
      ilike(documents.title, pattern),
      ilike(documents.path, pattern),
      ilike(documents.snippet, pattern),
    ),
  ];

  if (input.type) {
    conditions.push(eq(documents.type, input.type));
  }

  if (input.projectId) {
    conditions.push(eq(documents.projectId, input.projectId));
  }

  return db
    .select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt))
    .limit(input.limit ?? 20);
}

export async function purgeDocumentObject(workspaceId: string, id: string) {
  const row = await getDocumentRow(workspaceId, id);
  if (!row || row.byteSize === 0) {
    return;
  }

  await deleteObject(row.storageKey);
}
