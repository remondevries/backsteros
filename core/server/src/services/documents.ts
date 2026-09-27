import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import type {
  CreateDocumentInput,
  DocumentType,
  UpdateDocumentContentInput,
  UpdateDocumentInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { documents, projects, tasks } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { bodyForSnippet } from "../lib/document-frontmatter.js";
import { resolveSectionIfMatchVersion } from "../lib/document-property-filters.js";
import {
  clampRetrievalBudget,
  retrieveDocumentSections,
  type RetrievalHit,
} from "../lib/document-retrieval.js";
import {
  DocumentSectionError,
  readDocumentSection,
  replaceDocumentSectionBody,
} from "../lib/document-sections.js";
import {
  buildStorageKey,
  checksumForContent,
  deleteObject,
  ensureProjectVaultFolders,
  getObject,
  putObject,
  snippetForContent,
  SPACES_CATEGORY_KNOWLEDGE_BASE,
  SPACES_CATEGORY_SUPPORT,
  SPACES_CATEGORY_WEBSITES,
  SPACES_SECOND_BRAIN_FOLDER,
  SPACES_SECOND_BRAIN_RELATIVE,
  rewriteLegacyKnowledgeBaseStorageKey,
} from "../lib/storage.js";
import { compareAndSwapDocumentContent } from "./document-content-cas-write.js";
import { diskContentNeedsMetadataHeal } from "./document-content-heal.js";
import { withDocumentContentRowLock } from "./document-content-row-lock.js";
import {
  DocumentPropertyError,
  syncDocumentContentProperties,
} from "./document-properties.js";
import { awaitDocumentContentSaveTestGate } from "./document-content-save-test-gate.js";
import {
  DOCUMENT_CONTENT_SAVE_TIMEOUT_MS,
  withDocumentContentSaveTimeout,
} from "./document-content-timeout.js";
import { syncDocumentMetadataFromStorageKey } from "./vault-document-metadata.js";
import { recordDocumentContentSyncEvent } from "./sync.js";
import { getProjectById } from "./tasks-projects.js";
import {
  healSpacesHierarchy,
  moveDocumentWithPathRewrite,
} from "./spaces-hierarchy.js";

export { diskContentNeedsMetadataHeal } from "./document-content-heal.js";
export { healSpacesHierarchy } from "./spaces-hierarchy.js";

const DEFAULT_CONTENT_TYPE = "text/markdown; charset=utf-8";
type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

const SPACES_HIERARCHY_SEED: ReadonlyArray<{
  path: string;
  title: string;
  parentPath: string | null;
}> = [
  {
    path: SPACES_CATEGORY_KNOWLEDGE_BASE,
    title: "Knowledge Base",
    parentPath: null,
  },
  {
    path: SPACES_SECOND_BRAIN_RELATIVE,
    title: "Second brain",
    parentPath: SPACES_CATEGORY_KNOWLEDGE_BASE,
  },
  {
    path: SPACES_CATEGORY_SUPPORT,
    title: "Support",
    parentPath: null,
  },
  {
    path: SPACES_CATEGORY_WEBSITES,
    title: "Websites",
    parentPath: null,
  },
];

const SPACES_CATEGORY_ROOT_PATHS = new Set(
  SPACES_HIERARCHY_SEED.filter((row) => row.parentPath == null).map(
    (row) => row.path,
  ),
);

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

function propertyScalarIn(
  key: "type" | "audience" | "status" | "project",
  values: string[],
) {
  if (values.length === 1) {
    return sql`${documents.properties}->>${key} = ${values[0]}`;
  }
  return or(
    ...values.map((value) => sql`${documents.properties}->>${key} = ${value}`),
  )!;
}

export async function listDocuments(
  workspaceId: string,
  filters?: {
    type?: DocumentType | DocumentType[];
    projectId?: string;
    /** Semantic type from the OS-26 properties index (front matter `type`). */
    propertyType?: string[];
    /** Property audience from the OS-26 properties index. */
    audience?: string[];
    /** Property status from the OS-26 properties index. */
    status?: string[];
  },
  executor: DbExecutor = db,
) {
  const structuralTypes = filters?.type
    ? Array.isArray(filters.type)
      ? filters.type
      : [filters.type]
    : [];

  if (
    structuralTypes.length === 0 ||
    structuralTypes.includes("knowledge")
  ) {
    await ensureSpacesHierarchy(workspaceId, executor);
  }

  const conditions = [
    eq(documents.workspaceId, workspaceId),
    isNull(documents.deletedAt),
  ];

  if (structuralTypes.length === 1) {
    conditions.push(eq(documents.type, structuralTypes[0]!));
  } else if (structuralTypes.length > 1) {
    conditions.push(inArray(documents.type, structuralTypes));
  }

  if (filters?.projectId) {
    conditions.push(eq(documents.projectId, filters.projectId));
  }

  if (filters?.propertyType?.length) {
    conditions.push(propertyScalarIn("type", filters.propertyType));
  }
  if (filters?.audience?.length) {
    conditions.push(propertyScalarIn("audience", filters.audience));
  }
  if (filters?.status?.length) {
    conditions.push(propertyScalarIn("status", filters.status));
  }

  return executor
    .select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt));
}

/**
 * Ensure Knowledge Base / Support / Websites folder rows exist, and attach
 * orphan root knowledge documents under Second brain.
 */
export async function ensureSpacesHierarchy(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<void> {
  const byPath = new Map<string, string>();

  for (const seed of SPACES_HIERARCHY_SEED) {
    let row = await findDocumentByPath(
      workspaceId,
      "knowledge",
      seed.path,
      null,
      executor,
    );
    if (!row) {
      const parentId = seed.parentPath
        ? (byPath.get(seed.parentPath) ?? null)
        : null;
      try {
        row = await createDocument(
          workspaceId,
          {
            type: "knowledge",
            kind: "folder",
            title: seed.title,
            path: seed.path,
            parentId: parentId ?? undefined,
            content: "",
          },
          newId(),
          executor,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "DOCUMENT_PATH_EXISTS"
        ) {
          row = await findDocumentByPath(
            workspaceId,
            "knowledge",
            seed.path,
            null,
            executor,
          );
        } else {
          throw error;
        }
      }
    } else if (seed.parentPath) {
      const expectedParentId = byPath.get(seed.parentPath) ?? null;
      if (expectedParentId && row.parentId !== expectedParentId) {
        await executor
          .update(documents)
          .set({ parentId: expectedParentId, updatedAt: new Date() })
          .where(eq(documents.id, row.id));
        row = { ...row, parentId: expectedParentId };
      }
    }
    if (row) byPath.set(seed.path, row.id);
  }

  const secondBrainId = byPath.get(SPACES_SECOND_BRAIN_RELATIVE);
  if (!secondBrainId) return;

  const knowledgeRows = await executor
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.type, "knowledge"),
        isNull(documents.deletedAt),
      ),
    );

  const seedPaths = new Set(SPACES_HIERARCHY_SEED.map((s) => s.path));
  for (const row of knowledgeRows) {
    if (seedPaths.has(row.path)) continue;
    if (SPACES_CATEGORY_ROOT_PATHS.has(row.path)) continue;

    const nextStorageKey = rewriteLegacyKnowledgeBaseStorageKey(row.storageKey);
    const patches: {
      parentId?: string;
      storageKey?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    let changed = false;

    if (row.parentId == null) {
      patches.parentId = secondBrainId;
      changed = true;
    }
    if (nextStorageKey !== row.storageKey) {
      patches.storageKey = nextStorageKey;
      changed = true;
    }
    if (!changed) continue;

    await executor
      .update(documents)
      .set(patches)
      .where(eq(documents.id, row.id));
  }

  // Align paths with parent chain; move Portal under Support when misplaced.
  try {
    await healSpacesHierarchy(workspaceId, executor);
  } catch (error) {
    console.warn("[spaces] hierarchy heal failed", error);
  }
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
  let projectType: string | undefined;

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
    projectType = project.type;
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
  if (input.type === "project" && projectKey) {
    try {
      await ensureProjectVaultFolders(projectKey, undefined, {
        projectType,
      });
    } catch {
      // Vault may be unset yet — document create still proceeds until putObject.
    }
  }
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

  const journalDate =
    input.journalDate ??
    (input.type === "journal" ? new Date().toISOString().slice(0, 10) : null);
  // Journal titles are the calendar date — never free-form labels.
  const title = input.type === "journal" && journalDate ? journalDate : input.title;

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
      journalDate,
      path: input.path,
      title,
      storageKey,
      contentType: DEFAULT_CONTENT_TYPE,
      byteSize,
      checksum,
      snippet,
      contentVersion,
      contentEtag,
    })
    .returning();

  if (row && content.length > 0) {
    try {
      const synced = await syncDocumentContentProperties({
        workspaceId,
        row,
        content,
        assignDocKey: true,
        executor,
      });
      if (synced.content !== content) {
        await putObject(storageKey, synced.content);
      }
      const [indexed] = await executor
        .update(documents)
        .set({
          docKey: synced.docKey,
          properties: synced.properties,
          frontMatterValid: true,
          checksum: synced.checksum,
          snippet: synced.snippet,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, row.id))
        .returning();
      return indexed ?? row;
    } catch (error) {
      if (
        error instanceof DocumentPropertyError &&
        error.code === "INVALID_YAML"
      ) {
        await executor
          .update(documents)
          .set({ frontMatterValid: false, properties: {}, updatedAt: new Date() })
          .where(eq(documents.id, row.id));
      } else {
        throw error;
      }
    }
  }

  return row;
}

type UpdateDocumentServiceInput = UpdateDocumentInput & {
  /** Internal sync / properties path; not on the public PATCH schema. */
  projectId?: string | null;
};

export async function updateDocument(
  workspaceId: string,
  id: string,
  input: UpdateDocumentServiceInput,
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

  const nextJournalDate =
    input.journalDate !== undefined ? input.journalDate : existing.journalDate;
  // Journal titles stay locked to the entry date (YYYY-MM-DD).
  const nextTitle =
    existing.type === "journal"
      ? (nextJournalDate ?? existing.title)
      : input.title;

  const trackedDurationTouched =
    input.trackedDurationSeconds !== undefined ||
    input.trackedMinutes !== undefined;
  let nextLastTrackedAt: Date | null | undefined = undefined;
  if (input.lastTrackedAt !== undefined) {
    nextLastTrackedAt =
      input.lastTrackedAt == null ? null : new Date(input.lastTrackedAt);
  } else if (trackedDurationTouched) {
    const nextSeconds =
      input.trackedDurationSeconds !== undefined
        ? input.trackedDurationSeconds
        : input.trackedMinutes != null
          ? input.trackedMinutes * 60
          : null;
    if (nextSeconds != null && nextSeconds > 0) {
      nextLastTrackedAt = new Date();
    }
  }

  const [row] = await executor
    .update(documents)
    .set({
      title: nextTitle,
      path: input.path,
      parentId: input.parentId,
      icon: input.icon,
      sortOrder: input.sortOrder,
      journalDate: input.journalDate,
      publishStatus: input.publishStatus,
      publishSlug: input.publishSlug,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      audience: input.audience,
      contactIds: input.contactIds,
      placementFolderId: input.placementFolderId,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.trackedMinutes !== undefined
        ? { trackedMinutes: input.trackedMinutes }
        : {}),
      ...(input.trackedDurationSeconds !== undefined
        ? { trackedDurationSeconds: input.trackedDurationSeconds }
        : {}),
      ...(nextLastTrackedAt !== undefined
        ? { lastTrackedAt: nextLastTrackedAt }
        : {}),
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

  try {
    const object = await getObject(row.storageKey);
    const diskChecksum =
      object.byteSize > 0 ? checksumForContent(object.body) : null;

    if (
      diskContentNeedsMetadataHeal({
        rowByteSize: row.byteSize ?? 0,
        rowChecksum: row.checksum ?? null,
        diskByteSize: object.byteSize,
        diskChecksum,
      })
    ) {
      await syncDocumentMetadataFromStorageKey(workspaceId, row.storageKey);
      const refreshed = await getDocumentRow(workspaceId, id);
      return {
        row: refreshed ?? row,
        content: object.body,
      };
    }

    return {
      row,
      content: object.body,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STORAGE_OBJECT_NOT_FOUND"
    ) {
      // Metadata may still say empty for a brand-new doc with no file yet.
      if ((row.byteSize ?? 0) === 0) {
        return {
          row,
          content: "",
        };
      }
      throw error;
    }
    throw error;
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
  return moveDocumentWithPathRewrite(workspaceId, id, parentId);
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

export async function patchDocumentContentMetadataFromSyncPayload(
  workspaceId: string,
  id: string,
  payload: Record<string, unknown>,
  executor: DbExecutor = db,
) {
  const byteSize = payload.byte_size ?? payload.byteSize;
  const contentVersion = payload.content_version ?? payload.contentVersion;
  if (byteSize === undefined && contentVersion === undefined) {
    return null;
  }

  const existing = await getDocumentRow(workspaceId, id, executor);
  if (!existing) {
    return null;
  }

  const nextByteSize =
    byteSize === undefined || byteSize === null
      ? existing.byteSize
      : Number(byteSize);
  if (
    Number.isFinite(nextByteSize) &&
    nextByteSize === 0 &&
    (existing.byteSize ?? 0) > 0
  ) {
    return existing;
  }

  const nextContentVersion =
    contentVersion === undefined || contentVersion === null
      ? existing.contentVersion
      : Number(contentVersion);
  const checksum =
    payload.checksum === undefined
      ? existing.checksum
      : (payload.checksum as string | null);
  const snippet =
    payload.snippet === undefined
      ? existing.snippet
      : (payload.snippet as string | null);
  const contentEtag =
    payload.content_etag === undefined && payload.contentEtag === undefined
      ? existing.contentEtag
      : ((payload.content_etag ?? payload.contentEtag) as string | null);
  const updatedAtRaw = payload.updated_at ?? payload.updatedAt;
  const updatedAt =
    updatedAtRaw != null ? new Date(String(updatedAtRaw)) : new Date();

  const docKey =
    payload.doc_key === undefined && payload.docKey === undefined
      ? undefined
      : ((payload.doc_key ?? payload.docKey) as string | null);
  const properties =
    payload.properties === undefined
      ? undefined
      : (payload.properties as Record<string, unknown> | null);
  const frontMatterValidRaw =
    payload.front_matter_valid ?? payload.frontMatterValid;
  const frontMatterValid =
    frontMatterValidRaw === undefined
      ? undefined
      : Boolean(frontMatterValidRaw);

  const [row] = await executor
    .update(documents)
    .set({
      byteSize: Number.isFinite(nextByteSize) ? nextByteSize : existing.byteSize,
      contentVersion: Number.isFinite(nextContentVersion)
        ? nextContentVersion
        : existing.contentVersion,
      checksum,
      snippet,
      contentEtag,
      ...(docKey !== undefined ? { docKey } : {}),
      ...(properties !== undefined ? { properties } : {}),
      ...(frontMatterValid !== undefined ? { frontMatterValid } : {}),
      updatedAt,
    })
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
    .returning();

  return row ?? null;
}

/**
 * Mirror Tier-D bytes on local vault after cloud leader accepted content.
 * Uses the same row lock as updateDocumentContent so a concurrent save cannot
 * interleave putObject calls.
 */
export async function hydrateLocalDocumentVaultContent(
  workspaceId: string,
  id: string,
  content: string,
): Promise<void> {
  if (!content.length) return;
  await withDocumentContentRowLock(workspaceId, id, async (locked) => {
    if (!locked.storageKey) return;
    await withDocumentContentSaveTimeout(
      putObject(locked.storageKey, content),
      DOCUMENT_CONTENT_SAVE_TIMEOUT_MS,
    );
  });
}

export async function updateDocumentContent(
  workspaceId: string,
  id: string,
  input: UpdateDocumentContentInput,
  options?: { mutationId?: string; deviceId?: string },
) {
  let existing = await getDocumentRow(workspaceId, id);
  if (!existing) {
    return null;
  }

  // Heal vault-side drift before ifMatch so a stale desktop cache cannot
  // overwrite a newer .md with a matching outdated content_version.
  if (existing.storageKey) {
    await syncDocumentMetadataFromStorageKey(workspaceId, existing.storageKey);
    const healed = await getDocumentRow(workspaceId, id);
    if (!healed) {
      return null;
    }
    existing = healed;
  }

  try {
    let contentForWrite = input.content;
    let propertyPatch:
      | {
          properties: Record<string, unknown>;
          docKey: string | null;
          frontMatterValid: boolean;
          checksum: string;
          snippet: string;
        }
      | undefined;

    const cas = await compareAndSwapDocumentContent(
      {
        // Bytes come from contentForWrite (set under the lock after property sync).
        get content() {
          return contentForWrite;
        },
        ifMatchVersion: input.ifMatchVersion,
      },
      {
        // Close over contentForWrite so put/hash always use the post-sync body
        // (plain `input.content` strings must not win over the getter).
        putObject: (key, _content) => putObject(key, contentForWrite),
        checksumForContent: (_content) => checksumForContent(contentForWrite),
        snippetForContent: (_content) =>
          snippetForContent(bodyForSnippet(contentForWrite)),
        beforePutObject: awaitDocumentContentSaveTestGate,
        withLockedRow: async (fn) =>
          withDocumentContentRowLock(workspaceId, id, async (locked, tx) => {
            const observedVersion = locked.contentVersion;
            try {
              const synced = await syncDocumentContentProperties({
                workspaceId,
                row: locked,
                content: input.content,
                assignDocKey: true,
                executor: tx,
              });
              contentForWrite = synced.content;
              propertyPatch = {
                properties: synced.properties,
                docKey: synced.docKey,
                frontMatterValid: true,
                checksum: synced.checksum,
                snippet: synced.snippet,
              };
            } catch (error) {
              if (error instanceof DocumentPropertyError) {
                if (error.code === "INVALID_YAML") {
                  throw new Error("INVALID_YAML");
                }
                if (
                  error.code === "INVALID_PROPERTY" ||
                  error.code === "REFERENCE_NOT_FOUND"
                ) {
                  throw new Error("INVALID_PROPERTY");
                }
              }
              throw error;
            }
            return fn({
              existing: {
                contentVersion: observedVersion,
                storageKey: locked.storageKey,
                byteSize: locked.byteSize,
              },
              writeMeta: async (meta) => {
                const [updated] = await tx
                  .update(documents)
                  .set({
                    byteSize: meta.byteSize,
                    // meta.checksum is hashed from contentForWrite (same bytes put).
                    checksum: meta.checksum,
                    snippet: propertyPatch?.snippet ?? meta.snippet,
                    contentVersion: observedVersion + 1,
                    contentEtag: meta.contentEtag,
                    docKey: propertyPatch?.docKey ?? locked.docKey,
                    properties: propertyPatch?.properties ?? locked.properties,
                    frontMatterValid:
                      propertyPatch?.frontMatterValid ?? locked.frontMatterValid,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(documents.workspaceId, workspaceId),
                      eq(documents.id, id),
                      eq(documents.contentVersion, observedVersion),
                    ),
                  )
                  .returning();
                if (!updated) {
                  return null;
                }
                return {
                  contentVersion: updated.contentVersion,
                  byteSize: updated.byteSize,
                  checksum: updated.checksum ?? meta.checksum,
                  snippet: updated.snippet ?? meta.snippet,
                  contentEtag: updated.contentEtag,
                };
              },
            });
          }),
      },
    );

    if (!cas) {
      return null;
    }

    const updated = await getDocumentRow(workspaceId, id);
    if (!updated) {
      return null;
    }

    await recordDocumentContentSyncEvent({
      workspaceId,
      documentId: updated.id,
      mutationId:
        options?.mutationId ??
        `rest:document-content:${updated.id}:${updated.contentVersion}`,
      deviceId: options?.deviceId,
      payload: {
        id: updated.id,
        type: updated.type,
        project_id: updated.projectId,
        path: updated.path,
        title: updated.title,
        storage_key: updated.storageKey,
        byte_size: updated.byteSize,
        checksum: updated.checksum,
        snippet: updated.snippet,
        content_version: updated.contentVersion,
        content_etag: updated.contentEtag,
        updated_at: updated.updatedAt.toISOString(),
      },
    });

    return updated;
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_YAML") {
      throw new Error("INVALID_YAML");
    }
    if (error instanceof Error && error.message === "INVALID_PROPERTY") {
      throw new Error("INVALID_PROPERTY");
    }
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

async function taskDisplayKey(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor = db,
): Promise<string | null> {
  const [row] = await executor
    .select({
      number: tasks.number,
      projectKey: projects.key,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, taskId),
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (!row?.projectKey) return null;
  return `${row.projectKey}-${row.number}`;
}

/**
 * Documents whose properties index `linkedTasks` lists this task's display key.
 * Returns null when the task does not exist (caller should 404).
 */
export async function listDocumentsForTask(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor = db,
) {
  const [task] = await executor
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, taskId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (!task) return null;

  const displayKey = await taskDisplayKey(workspaceId, taskId, executor);
  if (!displayKey) {
    return [];
  }

  return executor
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        isNull(documents.deletedAt),
        eq(documents.kind, "document"),
        or(
          sql`${documents.properties}->'linkedTasks' @> ${JSON.stringify([displayKey])}::jsonb`,
          sql`${documents.properties}->>'linkedTasks' = ${displayKey}`,
        ),
      ),
    )
    .orderBy(desc(documents.updatedAt));
}

export async function getDocumentSection(
  workspaceId: string,
  id: string,
  heading: string,
) {
  const result = await getDocumentContent(workspaceId, id);
  if (!result) return null;
  try {
    const { section, text } = readDocumentSection(result.content, heading);
    return {
      row: result.row,
      heading: section.heading,
      headingPath: section.path,
      slug: section.slug,
      text,
      contentVersion: result.row.contentVersion,
    };
  } catch (error) {
    if (error instanceof DocumentSectionError) throw error;
    throw error;
  }
}

export async function updateDocumentSection(
  workspaceId: string,
  id: string,
  input: {
    heading: string;
    body: string;
    ifMatchVersion?: number;
  },
  options?: { mutationId?: string; deviceId?: string },
) {
  const existing = await getDocumentContent(workspaceId, id);
  if (!existing) return null;

  let nextContent: string;
  try {
    nextContent = replaceDocumentSectionBody(
      existing.content,
      input.heading,
      input.body,
    ).content;
  } catch (error) {
    if (error instanceof DocumentSectionError) throw error;
    throw error;
  }

  const row = await updateDocumentContent(
    workspaceId,
    id,
    {
      content: nextContent,
      ifMatchVersion: resolveSectionIfMatchVersion(
        input.ifMatchVersion,
        existing.row.contentVersion,
      ),
    },
    options,
  );
  if (!row) return null;

  const { section, text } = readDocumentSection(nextContent, input.heading);
  return {
    row,
    content: nextContent,
    heading: section.heading,
    headingPath: section.path,
    slug: section.slug,
    text,
  };
}

export async function retrieveDocuments(input: {
  workspaceId: string;
  q: string;
  propertyType?: string[];
  audience?: string[];
  status?: string[];
  /** Project key from the properties index (front matter `project`). */
  project?: string[];
  budget?: number;
  limit?: number;
  /** Cap how many candidate documents are loaded from storage. */
  candidateLimit?: number;
}): Promise<{
  results: RetrievalHit[];
  budget: number;
  truncated: boolean;
}> {
  const conditions = [
    eq(documents.workspaceId, input.workspaceId),
    isNull(documents.deletedAt),
    eq(documents.kind, "document"),
  ];
  if (input.propertyType?.length) {
    conditions.push(propertyScalarIn("type", input.propertyType));
  }
  if (input.audience?.length) {
    conditions.push(propertyScalarIn("audience", input.audience));
  }
  if (input.status?.length) {
    conditions.push(propertyScalarIn("status", input.status));
  }
  if (input.project?.length) {
    conditions.push(propertyScalarIn("project", input.project));
  }

  const rows = await db
    .select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt))
    .limit(input.candidateLimit ?? 100);

  const candidates: {
    id: string;
    docKey: string | null;
    title: string;
    content: string;
  }[] = [];

  for (const row of rows) {
    try {
      const object = await getObject(row.storageKey);
      candidates.push({
        id: row.id,
        docKey: row.docKey,
        title: row.title,
        content: object.body,
      });
    } catch {
      // Skip missing vault objects; same as search not inventing content.
    }
  }

  return retrieveDocumentSections({
    query: input.q,
    candidates,
    budget: clampRetrievalBudget(input.budget),
    limit: input.limit,
  });
}

export { DocumentSectionError };
