import { and, asc, eq, gt, or, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { apiKeys, coreReplicationCursors } from "../../db/schema.js";
import type { ReplicatedTable } from "./constants.js";
import { listActiveReplicatedTables } from "./tables.js";
import type {
  ApiKeyReplicationRow,
  ReplicationApplyResponse,
  ReplicationChange,
  ReplicationChangesResponse,
  ReplicationCursor,
} from "./types.js";

const PAGE_SIZE = 100;

export {
  isImplementedReplicatedTable,
  listActiveReplicatedTables,
} from "./tables.js";

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeApiKeyRow(
  row: typeof apiKeys.$inferSelect,
): ApiKeyReplicationRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    name: row.name,
    prefix: row.prefix,
    keyHash: row.keyHash,
    scopes: row.scopes,
    contactId: row.contactId,
    createdAt: toIso(row.createdAt),
    revokedAt: row.revokedAt ? toIso(row.revokedAt) : null,
    updatedAt: toIso(row.updatedAt),
  };
}

function compareCursor(a: ReplicationCursor, b: ReplicationCursor): number {
  const timeA = Date.parse(a.updatedAt);
  const timeB = Date.parse(b.updatedAt);
  if (timeA !== timeB) return timeA - timeB;
  return a.rowId.localeCompare(b.rowId);
}

function maxCursor(
  current: ReplicationCursor,
  candidate: ReplicationCursor,
): ReplicationCursor {
  return compareCursor(candidate, current) > 0 ? candidate : current;
}

export async function getReplicationCursor(
  table: ReplicatedTable,
): Promise<ReplicationCursor> {
  const [row] = await db
    .select()
    .from(coreReplicationCursors)
    .where(eq(coreReplicationCursors.tableName, table))
    .limit(1);

  if (!row) {
    return { updatedAt: new Date(0).toISOString(), rowId: "" };
  }

  return {
    updatedAt: toIso(row.updatedAt),
    rowId: row.rowId,
  };
}

export async function setReplicationCursor(
  table: ReplicatedTable,
  cursor: ReplicationCursor,
): Promise<void> {
  await db
    .insert(coreReplicationCursors)
    .values({
      tableName: table,
      updatedAt: new Date(cursor.updatedAt),
      rowId: cursor.rowId,
    })
    .onConflictDoUpdate({
      target: coreReplicationCursors.tableName,
      set: {
        updatedAt: new Date(cursor.updatedAt),
        rowId: cursor.rowId,
      },
    });
}

async function fetchApiKeyChanges(
  since: ReplicationCursor,
): Promise<{ changes: ReplicationChange[]; cursor: ReplicationCursor }> {
  const sinceDate = new Date(since.updatedAt);
  const rows = await db
    .select()
    .from(apiKeys)
    .where(
      or(
        gt(apiKeys.updatedAt, sinceDate),
        and(
          eq(apiKeys.updatedAt, sinceDate),
          gt(apiKeys.id, since.rowId),
        ),
      ),
    )
    .orderBy(asc(apiKeys.updatedAt), asc(apiKeys.id))
    .limit(PAGE_SIZE);

  let cursor = since;
  const changes: ReplicationChange[] = rows.map((row) => {
    cursor = maxCursor(cursor, {
      updatedAt: toIso(row.updatedAt),
      rowId: row.id,
    });
    return {
      table: "api_keys",
      row: serializeApiKeyRow(row),
    };
  });

  return { changes, cursor };
}

export async function fetchLocalChanges(
  table: ReplicatedTable,
  since: ReplicationCursor,
): Promise<{ changes: ReplicationChange[]; cursor: ReplicationCursor }> {
  if (table === "api_keys") {
    return fetchApiKeyChanges(since);
  }
  return { changes: [], cursor: since };
}

export async function fetchAllLocalRows(
  table: ReplicatedTable,
): Promise<ReplicationChange[]> {
  if (table !== "api_keys") {
    return [];
  }

  const rows = await db
    .select()
    .from(apiKeys)
    .orderBy(asc(apiKeys.updatedAt), asc(apiKeys.id));

  return rows.map((row) => ({
    table: "api_keys",
    row: serializeApiKeyRow(row),
  }));
}

async function applyApiKeyRow(row: ApiKeyReplicationRow): Promise<"applied" | "skipped"> {
  const remoteUpdatedAt = new Date(row.updatedAt);
  const [existing] = await db
    .select({ updatedAt: apiKeys.updatedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, row.id))
    .limit(1);

  if (existing && existing.updatedAt >= remoteUpdatedAt) {
    return "skipped";
  }

  await db
    .insert(apiKeys)
    .values({
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      name: row.name,
      prefix: row.prefix,
      keyHash: row.keyHash,
      scopes: row.scopes,
      contactId: row.contactId,
      createdAt: new Date(row.createdAt),
      revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
      updatedAt: remoteUpdatedAt,
    })
    .onConflictDoUpdate({
      target: apiKeys.id,
      set: {
        workspaceId: row.workspaceId,
        userId: row.userId,
        name: row.name,
        prefix: row.prefix,
        keyHash: row.keyHash,
        scopes: row.scopes,
        contactId: row.contactId,
        revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
        updatedAt: remoteUpdatedAt,
      },
      where: sql`${apiKeys.updatedAt} < ${remoteUpdatedAt}`,
    });

  return "applied";
}

export async function applyRemoteChanges(
  table: ReplicatedTable,
  changes: ReplicationChange[],
): Promise<ReplicationApplyResponse> {
  let applied = 0;
  let skipped = 0;

  for (const change of changes) {
    if (change.table !== table) {
      skipped += 1;
      continue;
    }

    if (table === "api_keys") {
      const result = await applyApiKeyRow(change.row);
      if (result === "applied") applied += 1;
      else skipped += 1;
      continue;
    }

    skipped += 1;
  }

  return { applied, skipped };
}

export async function getChangesSince(
  table: ReplicatedTable,
  since: ReplicationCursor,
): Promise<ReplicationChangesResponse> {
  const { changes, cursor } = await fetchLocalChanges(table, since);
  return { table, changes, cursor };
}

export async function bootstrapTableFromPeer(
  table: ReplicatedTable,
  changes: ReplicationChange[],
): Promise<ReplicationApplyResponse> {
  const result = await applyRemoteChanges(table, changes);
  if (changes.length > 0) {
    const last = changes[changes.length - 1]!;
    await setReplicationCursor(table, {
      updatedAt: last.row.updatedAt,
      rowId: last.row.id,
    });
  }
  return result;
}
