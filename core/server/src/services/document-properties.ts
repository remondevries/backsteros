import { and, eq, isNull, sql } from "drizzle-orm";

import type { Document } from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  contacts,
  documents,
  entityCounters,
  projects,
  tasks,
} from "../db/schema.js";
import type { DbDocument } from "../db/schema.js";
import {
  DOCUMENT_AUDIENCE_OPTIONS,
  DOCUMENT_PROPERTY_MIRROR_KEYS,
  DOCUMENT_SEMANTIC_TYPE_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
  applyMirrorFrontMatter,
  buildPropertiesIndex,
  coerceDocumentPropertyEnum,
  formatDocKey,
  parseDocKeyNumber,
  shouldAllocateDocKeyLocally,
  type DocumentPropertiesIndex,
} from "../lib/document-core-property-schema.js";
import {
  isReservedDocumentPropertyKey,
  validateDocumentPropertyValue,
  type DocumentPropertyType,
} from "@backsteros/contracts";
import { listActiveDocumentPropertyTypes } from "./document-property-types.js";

export { shouldAllocateDocKeyLocally };
import {
  bodyForSnippet,
  composeDocumentMarkdown,
  mergeFrontMatter,
  splitDocumentMarkdown,
} from "../lib/document-frontmatter.js";
import {
  checksumForContent,
  getObject,
  putObject,
  snippetForContent,
} from "../lib/storage.js";
import { compareAndSwapDocumentContent } from "./document-content-cas-write.js";
import { withDocumentContentRowLock } from "./document-content-row-lock.js";
import { awaitDocumentContentSaveTestGate } from "./document-content-save-test-gate.js";
import { recordDocumentContentSyncEvent } from "./sync.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

const AUDIENCE_TO_PUBLISH: Record<string, Document["audience"]> = {
  agents: "group",
  remon: "individual",
  client: "group",
  public: "group",
  group: "group",
  individual: "individual",
};

export class DocumentPropertyError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_YAML"
      | "INVALID_PROPERTY"
      | "CONTENT_VERSION_CONFLICT"
      | "DOCUMENT_NOT_FOUND"
      | "REFERENCE_NOT_FOUND"
      | "STORAGE_NOT_FOUND",
  ) {
    super(message);
    this.name = "DocumentPropertyError";
  }
}

export { formatDocKey, parseDocKeyNumber };

async function nextDocKeyNumber(
  workspaceId: string,
  executor: DbExecutor,
): Promise<number> {
  const [maxRow] = await executor
    .select({
      maxNumber: sql<number>`coalesce(max(substring(${documents.docKey} from '^DOC-([0-9]+)$')::int), 0)`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        isNull(documents.deletedAt),
        sql`${documents.docKey} IS NOT NULL`,
      ),
    );

  const minNext = Number(maxRow?.maxNumber ?? 0) + 1;

  const [counter] = await executor
    .insert(entityCounters)
    .values({
      workspaceId,
      entity: "document_key",
      scopeId: workspaceId,
      nextValue: minNext + 1,
    })
    .onConflictDoUpdate({
      target: [
        entityCounters.workspaceId,
        entityCounters.entity,
        entityCounters.scopeId,
      ],
      set: {
        nextValue: sql`greatest(${entityCounters.nextValue}, ${minNext}) + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ nextValue: entityCounters.nextValue });

  return counter!.nextValue - 1;
}

export async function ensureDocumentDocKey(
  workspaceId: string,
  row: DbDocument,
  executor: DbExecutor = db,
): Promise<string | null> {
  if (row.kind !== "document") return row.docKey;
  if (row.docKey) return row.docKey;
  if (!shouldAllocateDocKeyLocally()) {
    return null;
  }
  const number = await nextDocKeyNumber(workspaceId, executor);
  const docKey = formatDocKey(number);
  await executor
    .update(documents)
    .set({ docKey, updatedAt: new Date() })
    .where(eq(documents.id, row.id));
  return docKey;
}

function normalizeScalar(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : entry))
      .filter((entry) => entry != null && entry !== "");
  }
  return value;
}

function coerceEnum(
  key: string,
  value: unknown,
  allowed: readonly string[],
  strict: boolean,
): string | null {
  try {
    return coerceDocumentPropertyEnum(
      key,
      normalizeScalar(value),
      allowed,
      strict,
    );
  } catch {
    throw new DocumentPropertyError(
      `Invalid value for ${key}`,
      "INVALID_PROPERTY",
    );
  }
}

async function resolveProjectKey(
  workspaceId: string,
  projectId: string | null,
  executor: DbExecutor,
): Promise<string | null> {
  if (!projectId) return null;
  const [row] = await executor
    .select({ key: projects.key })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return row?.key ?? null;
}

async function resolveProjectIdByKey(
  workspaceId: string,
  key: string | null,
  executor: DbExecutor,
  strict: boolean,
): Promise<string | null> {
  if (!key?.trim()) return null;
  const [row] = await executor
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.key, key.trim()),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    if (!strict) return null;
    throw new DocumentPropertyError(
      `Unknown project key ${key}`,
      "REFERENCE_NOT_FOUND",
    );
  }
  return row.id;
}

async function resolveDocIdByKey(
  workspaceId: string,
  docKey: string | null,
  executor: DbExecutor,
  strict: boolean,
): Promise<string | null> {
  if (!docKey?.trim()) return null;
  const [row] = await executor
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.docKey, docKey.trim()),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    if (!strict) return null;
    throw new DocumentPropertyError(
      `Unknown document key ${docKey}`,
      "REFERENCE_NOT_FOUND",
    );
  }
  return row.id;
}

async function resolveContactId(
  workspaceId: string,
  contactRef: string | null,
  executor: DbExecutor,
  strict: boolean,
): Promise<string | null> {
  if (!contactRef?.trim()) return null;
  const [row] = await executor
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.id, contactRef.trim()),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    if (!strict) return null;
    throw new DocumentPropertyError(
      `Unknown contact ${contactRef}`,
      "REFERENCE_NOT_FOUND",
    );
  }
  return row.id;
}

async function resolveTaskIdsFromKeys(
  workspaceId: string,
  keys: unknown,
  executor: DbExecutor,
  strict: boolean,
): Promise<string[]> {
  const list = normalizeScalar(keys);
  if (!Array.isArray(list) || list.length === 0) return [];
  const ids: string[] = [];
  for (const entry of list) {
    if (typeof entry !== "string") continue;
    const match = entry.trim().match(/^([A-Za-z0-9_-]+)-(\d+)$/);
    if (!match) {
      if (!strict) continue;
      throw new DocumentPropertyError(
        `Invalid task key ${entry}`,
        "INVALID_PROPERTY",
      );
    }
    const projectKey = match[1]!;
    const number = Number(match[2]);
    const [project] = await executor
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.key, projectKey),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!project) {
      if (!strict) continue;
      throw new DocumentPropertyError(
        `Unknown task key ${entry}`,
        "REFERENCE_NOT_FOUND",
      );
    }
    const [task] = await executor
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.projectId, project.id),
          eq(tasks.number, number),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    if (!task) {
      if (!strict) continue;
      throw new DocumentPropertyError(
        `Unknown task key ${entry}`,
        "REFERENCE_NOT_FOUND",
      );
    }
    ids.push(task.id);
  }
  return ids;
}

export async function validateAndNormalizeProperties(input: {
  workspaceId: string;
  row: DbDocument;
  frontMatter: Record<string, unknown>;
  projectKey: string | null;
  executor?: DbExecutor;
  /**
   * Keys that must match definitions / resolve references.
   * Empty = preserve legacy (content index path).
   */
  strictKeys?: ReadonlySet<string>;
}): Promise<{ frontMatter: Record<string, unknown>; index: DocumentPropertiesIndex }> {
  const executor = input.executor ?? db;
  const fm = { ...input.frontMatter };
  const strictKeys = input.strictKeys ?? new Set<string>();
  const strict = (key: string) => strictKeys.has(key);

  const definitions = await listActiveDocumentPropertyTypes(
    input.workspaceId,
    input.row.projectId,
    executor,
  );
  const byKey = new Map(definitions.map((type) => [type.key, type]));

  for (const key of Object.keys(fm)) {
    if (isReservedDocumentPropertyKey(key) || key === "docKey") continue;
    const definition = byKey.get(key);
    const value = fm[key];
    if (value == null) {
      delete fm[key];
      continue;
    }
    if (!definition) continue;
    const checked = validateDocumentPropertyValue({
      key,
      kind: definition.kind,
      value,
      options: definition.options,
      multiple: definition.multiple || definition.kind === "multi-select",
    });
    if (!checked.ok) {
      if (strict(key)) {
        throw new DocumentPropertyError(checked.error, "INVALID_PROPERTY");
      }
      continue;
    }
    if (checked.value == null) {
      delete fm[key];
      continue;
    }
    fm[key] = checked.value;
  }

  const typeAllowed = (byKey.get("type")?.options ?? []).map((o) => o.value);
  const semanticType = coerceEnum(
    "type",
    fm.type,
    typeAllowed.length ? typeAllowed : DOCUMENT_SEMANTIC_TYPE_OPTIONS,
    strict("type"),
  );
  if (semanticType != null) fm.type = semanticType;

  const audienceAllowed = (byKey.get("audience")?.options ?? []).map(
    (o) => o.value,
  );
  const audience = coerceEnum(
    "audience",
    fm.audience,
    audienceAllowed.length ? audienceAllowed : DOCUMENT_AUDIENCE_OPTIONS,
    strict("audience"),
  );
  if (audience != null) fm.audience = audience;

  const statusAllowed = (byKey.get("status")?.options ?? []).map((o) => o.value);
  const status = coerceEnum(
    "status",
    fm.status,
    statusAllowed.length ? statusAllowed : DOCUMENT_STATUS_OPTIONS,
    strict("status"),
  );
  if (status != null) fm.status = status;

  if (fm.project != null) {
    await resolveProjectIdByKey(
      input.workspaceId,
      String(fm.project),
      executor,
      strict("project"),
    );
  }

  if (fm.supersededBy != null) {
    await resolveDocIdByKey(
      input.workspaceId,
      String(fm.supersededBy),
      executor,
      strict("supersededBy"),
    );
  }

  if (status === "superseded" && !fm.supersededBy && strict("status")) {
    throw new DocumentPropertyError(
      "supersededBy is required when status is superseded",
      "INVALID_PROPERTY",
    );
  }

  await resolveTypedReferences({
    workspaceId: input.workspaceId,
    frontMatter: fm,
    definitions: byKey,
    executor,
    strict,
  });

  const withMirrors = applyMirrorFrontMatter(
    input.row,
    fm,
    input.projectKey,
  );

  return {
    frontMatter: withMirrors,
    index: buildPropertiesIndex(withMirrors),
  };
}

async function resolveTypedReferences(input: {
  workspaceId: string;
  frontMatter: Record<string, unknown>;
  definitions: Map<string, DocumentPropertyType>;
  executor: DbExecutor;
  strict: (key: string) => boolean;
}) {
  for (const [key, definition] of input.definitions) {
    const value = input.frontMatter[key];
    if (value == null) continue;
    if (definition.kind === "contact") {
      const list = Array.isArray(value) ? value : [value];
      for (const entry of list) {
        await resolveContactId(
          input.workspaceId,
          String(entry),
          input.executor,
          input.strict(key),
        );
      }
    }
    if (definition.kind === "task") {
      await resolveTaskIdsFromKeys(
        input.workspaceId,
        value,
        input.executor,
        input.strict(key),
      );
    }
  }
}

export type DocumentContentPropertySyncResult = {
  content: string;
  properties: DocumentPropertiesIndex;
  frontMatterValid: boolean;
  docKey: string | null;
  snippet: string;
  checksum: string;
};

export async function syncDocumentContentProperties(input: {
  workspaceId: string;
  row: DbDocument;
  content: string;
  assignDocKey?: boolean;
  executor?: DbExecutor;
}): Promise<DocumentContentPropertySyncResult> {
  const executor = input.executor ?? db;
  const parsed = splitDocumentMarkdown(input.content);
  if (!parsed.valid) {
    throw new DocumentPropertyError("Invalid YAML front matter", "INVALID_YAML");
  }

  let docKey = input.row.docKey;
  if (input.assignDocKey && input.row.kind === "document" && !docKey) {
    docKey = await ensureDocumentDocKey(input.workspaceId, input.row, executor);
  }

  const projectKey = await resolveProjectKey(
    input.workspaceId,
    input.row.projectId,
    executor,
  );

  // Preserve legacy Spaces status/audience (and other unknown keys) on index.
  const { frontMatter, index } = await validateAndNormalizeProperties({
    workspaceId: input.workspaceId,
    row: input.row,
    frontMatter: parsed.frontMatter,
    projectKey,
    executor,
    strictKeys: new Set(),
  });

  if (docKey) {
    frontMatter.docKey = docKey;
    index.docKey = docKey;
  }

  const content = composeDocumentMarkdown({
    frontMatter,
    body: parsed.body,
  });
  const snippet = snippetForContent(bodyForSnippet(content));
  const checksum = checksumForContent(content);

  return {
    content,
    properties: index,
    frontMatterValid: true,
    docKey,
    snippet,
    checksum,
  };
}

export async function getDocumentProperties(
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
  if (!row) return null;

  return {
    docKey: row.docKey,
    properties: (row.properties ?? {}) as DocumentPropertiesIndex,
    frontMatterValid: row.frontMatterValid,
    contentVersion: row.contentVersion,
  };
}

export type PutDocumentPropertiesInput = {
  properties: Record<string, unknown>;
  ifMatchVersion?: number;
};

export type PlanDocumentPropertiesResult = {
  row: DbDocument;
  content: string;
  nextProjectId: string | null;
  nextAudience: string;
  properties: DocumentPropertiesIndex;
  docKey: string | null;
};

/**
 * Read + validate a properties PUT without writing. Throws when the vault
 * object cannot be read (never invents an empty body over a missing file).
 */
export async function planDocumentPropertiesPut(
  workspaceId: string,
  id: string,
  input: PutDocumentPropertiesInput,
  executor: DbExecutor = db,
): Promise<PlanDocumentPropertiesResult | null> {
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
  if (!row) return null;

  if (
    input.ifMatchVersion != null &&
    input.ifMatchVersion !== row.contentVersion
  ) {
    throw new DocumentPropertyError(
      "Document content version conflict",
      "CONTENT_VERSION_CONFLICT",
    );
  }

  if (!row.frontMatterValid) {
    throw new DocumentPropertyError("Invalid YAML front matter", "INVALID_YAML");
  }

  let content: string;
  try {
    const object = await getObject(row.storageKey);
    content = object.body;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STORAGE_OBJECT_NOT_FOUND"
    ) {
      throw new DocumentPropertyError(
        "Document content not found in storage",
        "STORAGE_NOT_FOUND",
      );
    }
    throw error;
  }

  const parsed = splitDocumentMarkdown(content);
  if (!parsed.valid) {
    throw new DocumentPropertyError("Invalid YAML front matter", "INVALID_YAML");
  }

  let nextProjectId = row.projectId;
  if (input.properties.project !== undefined) {
    nextProjectId = await resolveProjectIdByKey(
      workspaceId,
      input.properties.project == null
        ? null
        : String(input.properties.project),
      executor,
      true,
    );
  }

  let nextAudience = row.audience;
  if (input.properties.audience !== undefined) {
    const audience = coerceEnum(
      "audience",
      input.properties.audience,
      DOCUMENT_AUDIENCE_OPTIONS,
      true,
    );
    if (audience) {
      nextAudience = AUDIENCE_TO_PUBLISH[audience] ?? row.audience;
    }
  }

  const nextProjectKey = await resolveProjectKey(
    workspaceId,
    nextProjectId,
    executor,
  );

  const merged = mergeFrontMatter(parsed.frontMatter, input.properties);
  const mirrorRow = {
    ...row,
    projectId: nextProjectId,
    audience: nextAudience,
  };

  const strictKeys = new Set(
    Object.keys(input.properties).filter((key) => key !== "docKey"),
  );

  const { frontMatter, index } = await validateAndNormalizeProperties({
    workspaceId,
    row: mirrorRow,
    frontMatter: merged,
    projectKey: nextProjectKey,
    executor,
    strictKeys,
  });

  let docKey = row.docKey;
  if (!docKey && row.kind === "document") {
    docKey = await ensureDocumentDocKey(workspaceId, row, executor);
  }
  if (docKey) {
    frontMatter.docKey = docKey;
    index.docKey = docKey;
  }

  const nextContent = composeDocumentMarkdown({
    frontMatter,
    body: parsed.body,
  });

  return {
    row,
    content: nextContent,
    nextProjectId,
    nextAudience,
    properties: index,
    docKey,
  };
}

/**
 * Properties PUT under the same row lock + CAS as updateDocumentContent.
 * Rebuilds front matter / index from the post-update project + audience row.
 */
export async function putDocumentProperties(
  workspaceId: string,
  id: string,
  input: PutDocumentPropertiesInput,
  options?: { mutationId?: string; deviceId?: string },
) {
  const initial = await planDocumentPropertiesPut(workspaceId, id, input);
  if (!initial) return null;

  let contentForWrite = initial.content;
  let metaPatch = {
    projectId: initial.nextProjectId,
    audience: initial.nextAudience,
    docKey: initial.docKey,
    properties: initial.properties,
    checksum: checksumForContent(initial.content),
    snippet: snippetForContent(bodyForSnippet(initial.content)),
  };

  try {
    const cas = await compareAndSwapDocumentContent(
      {
        get content() {
          return contentForWrite;
        },
        ifMatchVersion: input.ifMatchVersion ?? initial.row.contentVersion,
      },
      {
        putObject: (key, _content) => putObject(key, contentForWrite),
        checksumForContent: (_content) => checksumForContent(contentForWrite),
        snippetForContent: (_content) =>
          snippetForContent(bodyForSnippet(contentForWrite)),
        beforePutObject: awaitDocumentContentSaveTestGate,
        withLockedRow: async (fn) =>
          withDocumentContentRowLock(workspaceId, id, async (locked, tx) => {
            const observedVersion = locked.contentVersion;
            const lockedPlan = await planDocumentPropertiesPut(
              workspaceId,
              id,
              {
                properties: input.properties,
                ifMatchVersion: observedVersion,
              },
              tx,
            );
            if (!lockedPlan) return null;
            contentForWrite = lockedPlan.content;
            metaPatch = {
              projectId: lockedPlan.nextProjectId,
              audience: lockedPlan.nextAudience,
              docKey: lockedPlan.docKey,
              properties: lockedPlan.properties,
              checksum: checksumForContent(lockedPlan.content),
              snippet: snippetForContent(bodyForSnippet(lockedPlan.content)),
            };
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
                    projectId: metaPatch.projectId,
                    audience: metaPatch.audience,
                    docKey: metaPatch.docKey,
                    properties: metaPatch.properties,
                    frontMatterValid: true,
                    byteSize: meta.byteSize,
                    checksum: meta.checksum,
                    snippet: metaPatch.snippet,
                    contentVersion: observedVersion + 1,
                    contentEtag: meta.contentEtag,
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
                if (!updated) return null;
                return {
                  contentVersion: updated.contentVersion,
                  byteSize: updated.byteSize,
                  checksum: updated.checksum ?? metaPatch.checksum,
                  snippet: updated.snippet ?? metaPatch.snippet,
                  contentEtag: updated.contentEtag,
                };
              },
            });
          }),
      },
    );

    if (!cas) {
      throw new DocumentPropertyError(
        "Document content version conflict",
        "CONTENT_VERSION_CONFLICT",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_VERSION_CONFLICT") {
      throw new DocumentPropertyError(
        "Document content version conflict",
        "CONTENT_VERSION_CONFLICT",
      );
    }
    throw error;
  }

  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
    .limit(1);
  if (!row) return null;

  await recordDocumentContentSyncEvent({
    workspaceId,
    documentId: row.id,
    mutationId:
      options?.mutationId ??
      `rest:document-properties:${row.id}:${row.contentVersion}`,
    deviceId: options?.deviceId,
    payload: {
      id: row.id,
      type: row.type,
      project_id: row.projectId,
      audience: row.audience,
      path: row.path,
      title: row.title,
      storage_key: row.storageKey,
      byte_size: row.byteSize,
      checksum: row.checksum,
      snippet: row.snippet,
      content_version: row.contentVersion,
      content_etag: row.contentEtag,
      doc_key: row.docKey,
      properties: row.properties,
      front_matter_valid: row.frontMatterValid,
      updated_at: row.updatedAt.toISOString(),
    },
  });

  return {
    row,
    content: contentForWrite,
    properties: (row.properties ?? {}) as DocumentPropertiesIndex,
    contentVersion: row.contentVersion,
  };
}

export async function indexDocumentFromContent(input: {
  workspaceId: string;
  row: DbDocument;
  content: string;
  assignDocKey?: boolean;
  executor?: DbExecutor;
}): Promise<DocumentContentPropertySyncResult | { invalidYaml: true }> {
  try {
    return await syncDocumentContentProperties(input);
  } catch (error) {
    if (
      error instanceof DocumentPropertyError &&
      error.code === "INVALID_YAML"
    ) {
      return { invalidYaml: true };
    }
    throw error;
  }
}

/** One-off: rebuild properties index (+ mirrors) from vault front matter. */
export async function rebuildDocumentPropertiesFromVault(
  workspaceId: string,
  options?: { limit?: number },
): Promise<{ scanned: number; updated: number; invalidYaml: number }> {
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.kind, "document"),
        isNull(documents.deletedAt),
      ),
    )
    .limit(options?.limit ?? 100_000);

  let updated = 0;
  let invalidYaml = 0;
  for (const row of rows) {
    let content: string;
    try {
      content = (await getObject(row.storageKey)).body;
    } catch {
      continue;
    }
    const indexed = await indexDocumentFromContent({
      workspaceId,
      row,
      content,
      assignDocKey: true,
    });
    if ("invalidYaml" in indexed) {
      invalidYaml += 1;
      await db
        .update(documents)
        .set({
          frontMatterValid: false,
          properties: {},
          updatedAt: new Date(),
        })
        .where(eq(documents.id, row.id));
      continue;
    }
    if (indexed.content !== content) {
      await putObject(row.storageKey, indexed.content);
    }
    await db
      .update(documents)
      .set({
        docKey: indexed.docKey,
        properties: indexed.properties,
        frontMatterValid: true,
        checksum: indexed.checksum,
        snippet: indexed.snippet,
        byteSize: Buffer.byteLength(indexed.content, "utf8"),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, row.id));
    updated += 1;
  }
  return { scanned: rows.length, updated, invalidYaml };
}

export function parseDocKeyNumberForTest(docKey: string): number | null {
  return parseDocKeyNumber(docKey);
}

export { DOCUMENT_PROPERTY_MIRROR_KEYS };
