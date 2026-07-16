import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

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

async function getDocumentRow(id: string) {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
    .limit(1);
  return row ?? null;
}

async function findDocumentByPath(
  type: DocumentType,
  path: string,
  projectId?: string | null,
) {
  const conditions = [
    eq(documents.type, type),
    eq(documents.path, path),
    isNull(documents.deletedAt),
  ];

  if (type === "project") {
    conditions.push(eq(documents.projectId, projectId ?? ""));
  } else {
    conditions.push(sql`${documents.projectId} IS NULL`);
  }

  const [row] = await db
    .select()
    .from(documents)
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

export async function listDocuments(filters?: {
  type?: DocumentType;
  projectId?: string;
}) {
  const conditions = [isNull(documents.deletedAt)];

  if (filters?.type) {
    conditions.push(eq(documents.type, filters.type));
  }

  if (filters?.projectId) {
    conditions.push(eq(documents.projectId, filters.projectId));
  }

  return db
    .select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt));
}

export async function getDocumentById(id: string) {
  return getDocumentRow(id);
}

export async function createDocument(input: CreateDocumentInput, id = newId()) {
  let projectKey: string | undefined;

  if (input.type === "project") {
    const project = await getProjectById(input.projectId!);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    projectKey = project.key;
  }

  const existing = await findDocumentByPath(
    input.type,
    input.path,
    input.projectId ?? null,
  );
  if (existing) {
    throw new Error("DOCUMENT_PATH_EXISTS");
  }

  const storageKey = buildStorageKey(input.type, input.path, projectKey);
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

  const [row] = await db
    .insert(documents)
    .values({
      id,
      type: input.type,
      projectId: input.projectId ?? null,
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

export async function updateDocument(id: string, input: UpdateDocumentInput) {
  const existing = await getDocumentRow(id);
  if (!existing) {
    return null;
  }

  if (input.path && input.path !== existing.path) {
    const conflict = await findDocumentByPath(
      existing.type as DocumentType,
      input.path,
      existing.projectId,
    );
    if (conflict) {
      throw new Error("DOCUMENT_PATH_EXISTS");
    }
  }

  const [row] = await db
    .update(documents)
    .set({
      title: input.title,
      path: input.path,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id))
    .returning();

  return row ?? null;
}

export async function deleteDocument(id: string) {
  const existing = await getDocumentRow(id);
  if (!existing) {
    return null;
  }

  const [row] = await db
    .update(documents)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(documents.id, id))
    .returning();

  return row ?? null;
}

export async function getDocumentContent(id: string) {
  const row = await getDocumentRow(id);
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

export async function updateDocumentContent(
  id: string,
  input: UpdateDocumentContentInput,
) {
  const row = await getDocumentRow(id);
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
      .where(eq(documents.id, id))
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
  q: string;
  type?: DocumentType;
  projectId?: string;
  limit?: number;
}) {
  const pattern = `%${input.q}%`;
  const conditions = [
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

export async function purgeDocumentObject(id: string) {
  const row = await getDocumentRow(id);
  if (!row || row.byteSize === 0) {
    return;
  }

  await deleteObject(row.storageKey);
}
