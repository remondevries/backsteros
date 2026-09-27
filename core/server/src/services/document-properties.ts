import { and, eq, isNull, sql } from "drizzle-orm";

import type { Document } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { contacts, documents, entityCounters, projects, tasks } from "../db/schema.js";
import type { DbDocument } from "../db/schema.js";
import {
  DOCUMENT_AUDIENCE_OPTIONS,
  DOCUMENT_PROPERTY_MIRROR_KEYS,
  DOCUMENT_SEMANTIC_TYPE_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
  applyMirrorFrontMatter,
  buildPropertiesIndex,
  type DocumentPropertiesIndex,
} from "../lib/document-core-property-schema.js";
import {
  bodyForSnippet,
  composeDocumentMarkdown,
  mergeFrontMatter,
  splitDocumentMarkdown,
} from "../lib/document-frontmatter.js";
import { checksumForContent, putObject, snippetForContent } from "../lib/storage.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

const AUDIENCE_TO_PUBLISH: Record<string, Document["audience"]> = {
  agents: "group",
  remon: "individual",
  client: "group",
  public: "group",
};

export class DocumentPropertyError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_YAML"
      | "INVALID_PROPERTY"
      | "CONTENT_VERSION_CONFLICT"
      | "DOCUMENT_NOT_FOUND"
      | "REFERENCE_NOT_FOUND",
  ) {
    super(message);
    this.name = "DocumentPropertyError";
  }
}

function parseDocKeyNumber(docKey: string): number | null {
  const match = docKey.trim().match(/^DOC-(\d+)$/i);
  if (!match) return null;
  return Number(match[1]);
}

export function formatDocKey(number: number): string {
  return `DOC-${number}`;
}

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

function assertEnum(
  key: string,
  value: unknown,
  allowed: readonly string[],
): string | null {
  const normalized = normalizeScalar(value);
  if (normalized == null) return null;
  if (typeof normalized !== "string" || !allowed.includes(normalized)) {
    throw new DocumentPropertyError(
      `Invalid value for ${key}`,
      "INVALID_PROPERTY",
    );
  }
  return normalized;
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
): Promise<string[]> {
  const list = normalizeScalar(keys);
  if (!Array.isArray(list) || list.length === 0) return [];
  const ids: string[] = [];
  for (const entry of list) {
    if (typeof entry !== "string") continue;
    const match = entry.trim().match(/^([A-Za-z0-9_-]+)-(\d+)$/);
    if (!match) {
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
}): Promise<{ frontMatter: Record<string, unknown>; index: DocumentPropertiesIndex }> {
  const executor = input.executor ?? db;
  const fm = { ...input.frontMatter };

  const semanticType = assertEnum(
    "type",
    fm.type,
    DOCUMENT_SEMANTIC_TYPE_OPTIONS,
  );
  if (semanticType != null) fm.type = semanticType;

  const audience = assertEnum(
    "audience",
    fm.audience,
    DOCUMENT_AUDIENCE_OPTIONS,
  );
  if (audience != null) fm.audience = audience;

  const status = assertEnum("status", fm.status, DOCUMENT_STATUS_OPTIONS);
  if (status != null) fm.status = status;

  if (fm.project != null) {
    await resolveProjectIdByKey(
      input.workspaceId,
      String(fm.project),
      executor,
    );
  }

  if (fm.supersededBy != null) {
    await resolveDocIdByKey(
      input.workspaceId,
      String(fm.supersededBy),
      executor,
    );
  }

  if (status === "superseded" && !fm.supersededBy) {
    throw new DocumentPropertyError(
      "supersededBy is required when status is superseded",
      "INVALID_PROPERTY",
    );
  }

  if (fm.owner != null) {
    await resolveContactId(input.workspaceId, String(fm.owner), executor);
  }

  if (fm.linkedContacts != null) {
    const list = normalizeScalar(fm.linkedContacts);
    if (Array.isArray(list)) {
      for (const entry of list) {
        await resolveContactId(input.workspaceId, String(entry), executor);
      }
    }
  }

  if (fm.linkedTasks != null) {
    await resolveTaskIdsFromKeys(input.workspaceId, fm.linkedTasks, executor);
  }

  if (fm.reviewDate != null && typeof fm.reviewDate !== "string") {
    throw new DocumentPropertyError(
      "reviewDate must be an ISO date string",
      "INVALID_PROPERTY",
    );
  }

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

  const { frontMatter, index } = await validateAndNormalizeProperties({
    workspaceId: input.workspaceId,
    row: input.row,
    frontMatter: parsed.frontMatter,
    projectKey,
    executor,
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

export async function putDocumentProperties(
  workspaceId: string,
  id: string,
  input: PutDocumentPropertiesInput,
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

  const { getObject } = await import("../lib/storage.js");
  let content = "";
  try {
    const object = await getObject(row.storageKey);
    content = object.body;
  } catch {
    content = "";
  }

  const parsed = splitDocumentMarkdown(content);
  if (!parsed.valid) {
    throw new DocumentPropertyError("Invalid YAML front matter", "INVALID_YAML");
  }

  const merged = mergeFrontMatter(parsed.frontMatter, input.properties);
  const projectKey = await resolveProjectKey(
    workspaceId,
    row.projectId,
    executor,
  );

  const { frontMatter, index } = await validateAndNormalizeProperties({
    workspaceId,
    row,
    frontMatter: merged,
    projectKey,
    executor,
  });

  let nextProjectId = row.projectId;
  if (input.properties.project !== undefined) {
    nextProjectId = await resolveProjectIdByKey(
      workspaceId,
      input.properties.project == null ? null : String(input.properties.project),
      executor,
    );
  }

  let nextAudience = row.audience;
  if (input.properties.audience !== undefined) {
    const audience = assertEnum(
      "audience",
      input.properties.audience,
      DOCUMENT_AUDIENCE_OPTIONS,
    );
    if (audience) {
      nextAudience = AUDIENCE_TO_PUBLISH[audience] ?? row.audience;
    }
  }

  const docKey =
    row.docKey ??
    (row.kind === "document"
      ? await ensureDocumentDocKey(workspaceId, row, executor)
      : null);
  if (docKey) {
    frontMatter.docKey = docKey;
    index.docKey = docKey;
  }

  const nextContent = composeDocumentMarkdown({
    frontMatter,
    body: parsed.body,
  });

  const stored = await putObject(row.storageKey, nextContent);
  const snippet = snippetForContent(bodyForSnippet(nextContent));
  const checksum = checksumForContent(nextContent);
  const nextVersion = row.contentVersion + 1;

  const [updated] = await executor
    .update(documents)
    .set({
      projectId: nextProjectId,
      audience: nextAudience,
      docKey,
      properties: index,
      frontMatterValid: true,
      byteSize: stored.byteSize,
      checksum,
      snippet,
      contentVersion: nextVersion,
      contentEtag: stored.etag,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.id, id),
        eq(documents.contentVersion, row.contentVersion),
      ),
    )
    .returning();

  if (!updated) {
    throw new DocumentPropertyError(
      "Document content version conflict",
      "CONTENT_VERSION_CONFLICT",
    );
  }

  return {
    row: updated,
    content: nextContent,
    properties: index,
    contentVersion: nextVersion,
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
    if (error instanceof DocumentPropertyError && error.code === "INVALID_YAML") {
      return { invalidYaml: true };
    }
    throw error;
  }
}

export function parseDocKeyNumberForTest(docKey: string): number | null {
  return parseDocKeyNumber(docKey);
}

export { DOCUMENT_PROPERTY_MIRROR_KEYS };
