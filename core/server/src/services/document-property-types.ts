import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm";

import type {
  CreateDocumentPropertyTypeInput,
  DocumentPropertyType,
  DocumentPropertyTypeKind,
  DocumentPropertyTypeStatus,
  UpdateDocumentPropertyTypeInput,
} from "@backsteros/contracts";
import {
  CORE_DOCUMENT_PROPERTY_TYPE_SEEDS,
  DOCUMENT_PROPERTY_TYPE_KINDS,
  isDocumentPropertyTypeKey,
  isReservedDocumentPropertyKey,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { documentPropertyTypes, documents, projects } from "../db/schema.js";
import { documentPropertyTypeSeedId, newId } from "../lib/crypto.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

const KIND_SET = new Set<string>(DOCUMENT_PROPERTY_TYPE_KINDS);

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function parseKind(value: string): DocumentPropertyTypeKind {
  if (!KIND_SET.has(value)) throw new Error("INVALID_DOCUMENT_PROPERTY_TYPE");
  return value as DocumentPropertyTypeKind;
}

function parseStatus(value: string): DocumentPropertyTypeStatus {
  if (value === "active" || value === "proposed" || value === "rejected") {
    return value;
  }
  return "active";
}

function parseOptions(value: unknown): { value: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  const options: { value: string; label: string }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as { value?: unknown; label?: unknown };
    if (typeof raw.value !== "string" || typeof raw.label !== "string") continue;
    const optionValue = raw.value.trim();
    const label = raw.label.trim();
    if (!optionValue || !label) continue;
    options.push({ value: optionValue, label });
  }
  return options;
}

export function mapDocumentPropertyType(
  row: typeof documentPropertyTypes.$inferSelect,
): DocumentPropertyType {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    kind: parseKind(row.kind),
    options: parseOptions(row.options),
    multiple: row.multiple,
    projectId: row.projectId ?? null,
    status: parseStatus(row.status),
    seeded: row.seeded,
    proposedByContactId: row.proposedByContactId ?? null,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

export function documentPropertyTypeSyncSnapshot(
  row: typeof documentPropertyTypes.$inferSelect,
) {
  const mapped = mapDocumentPropertyType(row);
  return {
    id: mapped.id,
    key: mapped.key,
    label: mapped.label,
    kind: mapped.kind,
    options: mapped.options,
    multiple: mapped.multiple,
    project_id: mapped.projectId,
    status: mapped.status,
    seeded: mapped.seeded,
    proposed_by_contact_id: mapped.proposedByContactId,
    created_at: mapped.createdAt,
    updated_at: mapped.updatedAt,
    deleted_at: toIso(row.deletedAt),
    sort_order: row.sortOrder,
  };
}

async function assertUniqueLiveKey(
  workspaceId: string,
  key: string,
  excludeId: string | null,
  executor: DbExecutor,
) {
  const filters = [
    eq(documentPropertyTypes.workspaceId, workspaceId),
    isNull(documentPropertyTypes.deletedAt),
    sql`${documentPropertyTypes.key} = ${key}`,
    sql`${documentPropertyTypes.status} in ('active', 'proposed')`,
  ];
  if (excludeId) filters.push(ne(documentPropertyTypes.id, excludeId));
  const [row] = await executor
    .select({ id: documentPropertyTypes.id })
    .from(documentPropertyTypes)
    .where(and(...filters))
    .limit(1);
  if (row) throw new Error("DOCUMENT_PROPERTY_TYPE_KEY_TAKEN");
}

async function assertProjectScope(
  workspaceId: string,
  projectId: string | null,
  executor: DbExecutor,
) {
  if (!projectId) return;
  const [row] = await executor
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.workspaceId, workspaceId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new Error("INVALID_DOCUMENT_PROPERTY_TYPE");
}

export async function getDocumentPropertyTypeById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(documentPropertyTypes)
    .where(
      and(
        eq(documentPropertyTypes.id, id),
        eq(documentPropertyTypes.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function ensureCoreDocumentPropertyTypes(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<void> {
  const existing = await executor
    .select({ key: documentPropertyTypes.key })
    .from(documentPropertyTypes)
    .where(eq(documentPropertyTypes.workspaceId, workspaceId));
  const used = new Set(existing.map((row) => row.key));
  const missing = CORE_DOCUMENT_PROPERTY_TYPE_SEEDS.filter(
    (seed) => !used.has(seed.key),
  );
  if (missing.length === 0) return;

  const { shouldForwardMutationsToLeader } = await import(
    "./core-replication/leader-mutations.js"
  );
  if (executor === db && shouldForwardMutationsToLeader()) {
    const { commitRestEntityWriteBatch, buildDocumentPropertyTypeRestPayload } =
      await import("./rest-leader-write.js");
    await commitRestEntityWriteBatch({
      workspaceId,
      changes: missing.map((seed, index) => {
        const id = documentPropertyTypeSeedId(workspaceId, seed.key);
        return {
          entity: "document_property_type" as const,
          entityId: id,
          operation: "upsert" as const,
          payload: buildDocumentPropertyTypeRestPayload(id, {
            key: seed.key,
            label: seed.label,
            kind: seed.kind,
            options: seed.options ?? [],
            multiple: seed.multiple === true,
            projectId: null,
            status: "active",
            seeded: true,
            sortOrder: index + 1,
          }),
        };
      }),
    });
    return;
  }

  const now = new Date();
  for (const [index, seed] of missing.entries()) {
    await executor
      .insert(documentPropertyTypes)
      .values({
        id: documentPropertyTypeSeedId(workspaceId, seed.key),
        workspaceId,
        key: seed.key,
        label: seed.label,
        kind: seed.kind,
        options: seed.options ?? [],
        multiple: seed.multiple === true,
        projectId: null,
        status: "active",
        seeded: true,
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }
}

export async function listDocumentPropertyTypes(
  workspaceId: string,
  query?: { status?: DocumentPropertyTypeStatus; projectId?: string },
  executor: DbExecutor = db,
): Promise<DocumentPropertyType[]> {
  await ensureCoreDocumentPropertyTypes(workspaceId, executor);
  const filters = [
    eq(documentPropertyTypes.workspaceId, workspaceId),
    isNull(documentPropertyTypes.deletedAt),
  ];
  if (query?.status) {
    filters.push(eq(documentPropertyTypes.status, query.status));
  } else {
    filters.push(
      or(
        eq(documentPropertyTypes.status, "active"),
        eq(documentPropertyTypes.status, "proposed"),
      )!,
    );
  }
  if (query?.projectId) {
    filters.push(
      or(
        isNull(documentPropertyTypes.projectId),
        eq(documentPropertyTypes.projectId, query.projectId),
      )!,
    );
  }
  const rows = await executor
    .select()
    .from(documentPropertyTypes)
    .where(and(...filters))
    .orderBy(
      asc(documentPropertyTypes.sortOrder),
      asc(documentPropertyTypes.label),
    );
  return rows.map(mapDocumentPropertyType);
}

export async function listActiveDocumentPropertyTypes(
  workspaceId: string,
  projectId?: string | null,
  executor: DbExecutor = db,
): Promise<DocumentPropertyType[]> {
  const types = await listDocumentPropertyTypes(
    workspaceId,
    { status: "active", projectId: projectId ?? undefined },
    executor,
  );
  if (!projectId) return types.filter((type) => type.projectId == null);
  return types.filter(
    (type) => type.projectId == null || type.projectId === projectId,
  );
}

export async function createDocumentPropertyType(
  workspaceId: string,
  input: CreateDocumentPropertyTypeInput & {
    id?: string;
    status?: DocumentPropertyTypeStatus;
    seeded?: boolean;
    proposedByContactId?: string | null;
    sortOrder?: number;
  },
  executor: DbExecutor = db,
): Promise<DocumentPropertyType> {
  const key = input.key.trim();
  if (!isDocumentPropertyTypeKey(key) || isReservedDocumentPropertyKey(key)) {
    throw new Error("INVALID_DOCUMENT_PROPERTY_TYPE");
  }
  const kind = parseKind(input.kind);
  if (
    (kind === "select" || kind === "multi-select") &&
    parseOptions(input.options ?? []).length === 0
  ) {
    throw new Error("INVALID_DOCUMENT_PROPERTY_TYPE");
  }
  const projectId = input.projectId ?? null;
  await assertProjectScope(workspaceId, projectId, executor);
  const id = input.id?.trim() || newId();
  const existing = await getDocumentPropertyTypeById(workspaceId, id, executor);
  if (existing && !existing.deletedAt) {
    const updated = await updateDocumentPropertyType(
      workspaceId,
      id,
      {
        key,
        label: input.label,
        kind,
        options: input.options,
        multiple: input.multiple,
        projectId,
      },
      executor,
    );
    if (!updated) throw new Error("INVALID_DOCUMENT_PROPERTY_TYPE");
    return updated;
  }
  await assertUniqueLiveKey(workspaceId, key, null, executor);
  const [maxRow] = await executor
    .select({ sortOrder: documentPropertyTypes.sortOrder })
    .from(documentPropertyTypes)
    .where(eq(documentPropertyTypes.workspaceId, workspaceId))
    .orderBy(sql`${documentPropertyTypes.sortOrder} DESC`)
    .limit(1);
  const now = new Date();
  const [row] = await executor
    .insert(documentPropertyTypes)
    .values({
      id,
      workspaceId,
      key,
      label: input.label.trim(),
      kind,
      options: parseOptions(input.options ?? []),
      multiple: input.multiple === true || kind === "multi-select",
      projectId,
      status: input.status ?? "active",
      seeded: input.seeded === true,
      proposedByContactId: input.proposedByContactId ?? null,
      sortOrder: input.sortOrder ?? (maxRow?.sortOrder ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    const raced = await getDocumentPropertyTypeById(workspaceId, id, executor);
    if (!raced) throw new Error("INVALID_DOCUMENT_PROPERTY_TYPE");
    return mapDocumentPropertyType(raced);
  }
  return mapDocumentPropertyType(row);
}

export async function updateDocumentPropertyType(
  workspaceId: string,
  id: string,
  input: UpdateDocumentPropertyTypeInput,
  executor: DbExecutor = db,
): Promise<DocumentPropertyType | null> {
  const existing = await getDocumentPropertyTypeById(workspaceId, id, executor);
  if (!existing || existing.deletedAt) return null;
  const patch: {
    key?: string;
    label?: string;
    kind?: string;
    options?: { value: string; label: string }[];
    multiple?: boolean;
    projectId?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.key !== undefined) {
    const key = input.key.trim();
    if (!isDocumentPropertyTypeKey(key) || isReservedDocumentPropertyKey(key)) {
      throw new Error("INVALID_DOCUMENT_PROPERTY_TYPE");
    }
    if (key !== existing.key) {
      await assertUniqueLiveKey(workspaceId, key, id, executor);
    }
    patch.key = key;
  }
  if (input.label !== undefined) patch.label = input.label.trim();
  if (input.kind !== undefined) patch.kind = parseKind(input.kind);
  if (input.options !== undefined) patch.options = parseOptions(input.options);
  if (input.multiple !== undefined) patch.multiple = input.multiple;
  if (input.projectId !== undefined) {
    await assertProjectScope(workspaceId, input.projectId, executor);
    patch.projectId = input.projectId;
  }
  const nextKind = parseKind(patch.kind ?? existing.kind);
  const nextOptions = patch.options ?? parseOptions(existing.options);
  if (
    (nextKind === "select" || nextKind === "multi-select") &&
    nextOptions.length === 0
  ) {
    throw new Error("INVALID_DOCUMENT_PROPERTY_TYPE");
  }
  const [row] = await executor
    .update(documentPropertyTypes)
    .set(patch)
    .where(
      and(
        eq(documentPropertyTypes.id, id),
        eq(documentPropertyTypes.workspaceId, workspaceId),
      ),
    )
    .returning();
  return row ? mapDocumentPropertyType(row) : null;
}

export async function setDocumentPropertyTypeStatus(
  workspaceId: string,
  id: string,
  status: DocumentPropertyTypeStatus,
  executor: DbExecutor = db,
): Promise<DocumentPropertyType | null> {
  const existing = await getDocumentPropertyTypeById(workspaceId, id, executor);
  if (!existing || existing.deletedAt) return null;
  const [row] = await executor
    .update(documentPropertyTypes)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(documentPropertyTypes.id, id),
        eq(documentPropertyTypes.workspaceId, workspaceId),
      ),
    )
    .returning();
  return row ? mapDocumentPropertyType(row) : null;
}

export async function countDocumentsUsingPropertyKey(
  workspaceId: string,
  key: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        isNull(documents.deletedAt),
        sql`${documents.properties} ? ${key}`,
      ),
    );
  return Number(row?.count ?? 0);
}

export async function deleteDocumentPropertyType(
  workspaceId: string,
  id: string,
  options?: { confirm?: boolean },
  executor: DbExecutor = db,
): Promise<DocumentPropertyType | null> {
  const existing = await getDocumentPropertyTypeById(workspaceId, id, executor);
  if (!existing || existing.deletedAt) return null;
  const usageCount = await countDocumentsUsingPropertyKey(
    workspaceId,
    existing.key,
    executor,
  );
  if (usageCount > 0 && !options?.confirm) {
    const error = new Error("DOCUMENT_PROPERTY_TYPE_IN_USE");
    (error as Error & { usageCount?: number }).usageCount = usageCount;
    throw error;
  }
  const now = new Date();
  const [row] = await executor
    .update(documentPropertyTypes)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(documentPropertyTypes.id, id),
        eq(documentPropertyTypes.workspaceId, workspaceId),
      ),
    )
    .returning();
  return row ? mapDocumentPropertyType(row) : null;
}
