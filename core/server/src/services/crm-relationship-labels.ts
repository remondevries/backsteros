import type {
  CrmRelationshipLabel,
  CrmRelationshipLabelInput,
  UpdateCrmRelationshipLabelInput,
} from "@backsteros/contracts";
import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  contactRelationships,
  crmRelationshipLabels,
  workspaces,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  DEFAULT_RELATIONSHIP_LABEL_SEEDS,
  relationshipTypeLabel,
  relationshipTypeLabelFromCatalog,
  RELATIONSHIP_TYPE_LABELS,
  slugifyRelationshipLabel,
} from "./crm-relationship-label-utils.js";

export {
  DEFAULT_RELATIONSHIP_LABEL_SEEDS,
  relationshipTypeLabel,
  relationshipTypeLabelFromCatalog,
  RELATIONSHIP_TYPE_LABELS,
  slugifyRelationshipLabel,
} from "./crm-relationship-label-utils.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapLabel(
  row: typeof crmRelationshipLabels.$inferSelect,
): CrmRelationshipLabel {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sideALabel: row.sideALabel,
    sideASlug: row.sideASlug,
    sideBLabel: row.sideBLabel,
    sideBSlug: row.sideBSlug,
    color: row.color,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export async function listCrmRelationshipLabels(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<CrmRelationshipLabel[]> {
  await ensureDefaultRelationshipLabels(workspaceId, executor);
  const rows = await executor
    .select()
    .from(crmRelationshipLabels)
    .where(
      and(
        eq(crmRelationshipLabels.workspaceId, workspaceId),
        isNull(crmRelationshipLabels.deletedAt),
      ),
    )
    .orderBy(
      asc(crmRelationshipLabels.sortOrder),
      asc(crmRelationshipLabels.sideALabel),
    );
  return rows.map(mapLabel);
}

export async function getCrmRelationshipLabelById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<CrmRelationshipLabel | null> {
  const [row] = await executor
    .select()
    .from(crmRelationshipLabels)
    .where(
      and(
        eq(crmRelationshipLabels.workspaceId, workspaceId),
        eq(crmRelationshipLabels.id, id),
        isNull(crmRelationshipLabels.deletedAt),
      ),
    )
    .limit(1);
  return row ? mapLabel(row) : null;
}

async function slugConflicts(
  workspaceId: string,
  slugs: string[],
  excludeId: string | null,
  executor: DbExecutor,
): Promise<boolean> {
  const unique = [...new Set(slugs.filter(Boolean))];
  if (unique.length === 0) return false;
  const conditions = [
    eq(crmRelationshipLabels.workspaceId, workspaceId),
    isNull(crmRelationshipLabels.deletedAt),
    or(
      inArray(crmRelationshipLabels.sideASlug, unique),
      inArray(crmRelationshipLabels.sideBSlug, unique),
    ),
  ];
  if (excludeId) {
    conditions.push(ne(crmRelationshipLabels.id, excludeId));
  }
  const [row] = await executor
    .select({ id: crmRelationshipLabels.id })
    .from(crmRelationshipLabels)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

export async function createCrmRelationshipLabel(
  workspaceId: string,
  input: CrmRelationshipLabelInput,
  entityId?: string,
  executor: DbExecutor = db,
): Promise<CrmRelationshipLabel> {
  const sideALabel = input.sideALabel.trim();
  const sideBLabel = input.sideBLabel.trim();
  const sideASlug =
    input.sideASlug?.trim() || slugifyRelationshipLabel(sideALabel);
  const sideBSlug =
    input.sideBSlug?.trim() || slugifyRelationshipLabel(sideBLabel);
  if (!sideASlug || !sideBSlug) {
    throw new Error("INVALID_LABEL");
  }
  if (await slugConflicts(workspaceId, [sideASlug, sideBSlug], null, executor)) {
    throw new Error("LABEL_SLUG_CONFLICT");
  }

  const [row] = await executor
    .insert(crmRelationshipLabels)
    .values({
      id: entityId ?? newId(),
      workspaceId,
      sideALabel,
      sideASlug,
      sideBLabel,
      sideBSlug,
      color: input.color ?? null,
      sortOrder: input.sortOrder ?? Date.now(),
    })
    .returning();
  return mapLabel(row!);
}

export async function updateCrmRelationshipLabel(
  workspaceId: string,
  id: string,
  input: UpdateCrmRelationshipLabelInput,
  executor: DbExecutor = db,
): Promise<CrmRelationshipLabel | null> {
  const existing = await getCrmRelationshipLabelById(workspaceId, id, executor);
  if (!existing) return null;

  const sideALabel = input.sideALabel?.trim() ?? existing.sideALabel;
  const sideBLabel = input.sideBLabel?.trim() ?? existing.sideBLabel;
  const sideASlug =
    input.sideASlug?.trim() ||
    (input.sideALabel != null
      ? slugifyRelationshipLabel(sideALabel)
      : existing.sideASlug);
  const sideBSlug =
    input.sideBSlug?.trim() ||
    (input.sideBLabel != null
      ? slugifyRelationshipLabel(sideBLabel)
      : existing.sideBSlug);

  if (!sideASlug || !sideBSlug) {
    throw new Error("INVALID_LABEL");
  }
  if (await slugConflicts(workspaceId, [sideASlug, sideBSlug], id, executor)) {
    throw new Error("LABEL_SLUG_CONFLICT");
  }

  const [row] = await executor
    .update(crmRelationshipLabels)
    .set({
      sideALabel,
      sideASlug,
      sideBLabel,
      sideBSlug,
      color: input.color === undefined ? existing.color : input.color,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(crmRelationshipLabels.workspaceId, workspaceId),
        eq(crmRelationshipLabels.id, id),
        isNull(crmRelationshipLabels.deletedAt),
      ),
    )
    .returning();
  if (!row) return null;

  const slugRemaps = new Map<string, string>();
  if (existing.sideASlug !== sideASlug) {
    slugRemaps.set(existing.sideASlug, sideASlug);
  }
  if (existing.sideBSlug !== sideBSlug) {
    slugRemaps.set(existing.sideBSlug, sideBSlug);
  }

  for (const [from, to] of slugRemaps) {
    if (from === to) continue;
    await executor
      .update(contactRelationships)
      .set({ type: to, updatedAt: new Date() })
      .where(
        and(
          eq(contactRelationships.workspaceId, workspaceId),
          eq(contactRelationships.type, from),
          isNull(contactRelationships.deletedAt),
        ),
      );
  }

  return mapLabel(row);
}

export async function deleteCrmRelationshipLabel(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const now = new Date();
  const updated = await executor
    .update(crmRelationshipLabels)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(crmRelationshipLabels.workspaceId, workspaceId),
        eq(crmRelationshipLabels.id, id),
        isNull(crmRelationshipLabels.deletedAt),
      ),
    )
    .returning({ id: crmRelationshipLabels.id });
  return updated.length > 0;
}

/** Insert missing default pairs for a workspace (idempotent). */
export async function ensureDefaultRelationshipLabels(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<void> {
  // Include soft-deleted rows so deleting a seeded label does not recreate it.
  const existing = await executor
    .select({
      sideASlug: crmRelationshipLabels.sideASlug,
      sideBSlug: crmRelationshipLabels.sideBSlug,
    })
    .from(crmRelationshipLabels)
    .where(eq(crmRelationshipLabels.workspaceId, workspaceId));
  const used = new Set<string>();
  for (const row of existing) {
    used.add(row.sideASlug);
    used.add(row.sideBSlug);
  }

  const toInsert = DEFAULT_RELATIONSHIP_LABEL_SEEDS.filter((seed) => {
    if (seed.sideASlug === seed.sideBSlug) {
      return !used.has(seed.sideASlug);
    }
    return !used.has(seed.sideASlug) && !used.has(seed.sideBSlug);
  });
  if (toInsert.length === 0) return;

  const { shouldForwardMutationsToLeader } = await import(
    "./core-replication/leader-mutations.js"
  );
  if (executor === db && shouldForwardMutationsToLeader()) {
    const { commitRestEntityWriteBatch, buildCrmRelationshipLabelRestPayload } =
      await import("./rest-leader-write.js");
    await commitRestEntityWriteBatch({
      workspaceId,
      changes: toInsert.map((seed) => {
        const id = newId();
        return {
          entity: "crm_relationship_label" as const,
          entityId: id,
          operation: "upsert" as const,
          payload: buildCrmRelationshipLabelRestPayload(id, {
            sideALabel: seed.sideALabel,
            sideASlug: seed.sideASlug,
            sideBLabel: seed.sideBLabel,
            sideBSlug: seed.sideBSlug,
            color: null,
            sortOrder: seed.sortOrder,
          }),
        };
      }),
    });
    return;
  }

  const rows = await executor
    .insert(crmRelationshipLabels)
    .values(
      toInsert.map((seed) => ({
        id: newId(),
        workspaceId,
        sideALabel: seed.sideALabel,
        sideASlug: seed.sideASlug,
        sideBLabel: seed.sideBLabel,
        sideBSlug: seed.sideBSlug,
        color: null,
        sortOrder: seed.sortOrder,
      })),
    )
    .returning();
  if (executor === db) {
    const { recordCrmRelationshipLabelRestSyncEvent } = await import(
      "./sync.js"
    );
    for (const row of rows) {
      await recordCrmRelationshipLabelRestSyncEvent(workspaceId, row, "upsert");
    }
  }
}

/** Ensure every workspace has default labels (migration helper / boot). */
export async function ensureDefaultRelationshipLabelsForAllWorkspaces(
  executor: DbExecutor = db,
): Promise<void> {
  const rows = await executor.select({ id: workspaces.id }).from(workspaces);
  for (const row of rows) {
    await ensureDefaultRelationshipLabels(row.id, executor);
  }
}
