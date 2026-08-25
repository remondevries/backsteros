import { eq } from "drizzle-orm";

import { db, sqlClient } from "../../db/index.js";
import { coreReplicationCursors } from "../../db/schema.js";
import type { ReplicatedTable } from "./constants.js";
import type { ReplicationCursor } from "./types.js";

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function tableExists(tableName: string): Promise<boolean> {
  const rows = await sqlClient<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
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
  // Never move a cursor backwards — overlapping ticks / stalled bulk pushes
  // must not clobber a newer tip after bootstrap or a concurrent tick.
  const existing = await getReplicationCursor(table);
  const next = maxCursor(existing, cursor);
  if (compareCursor(next, existing) <= 0 && existing.rowId !== "") {
    return;
  }

  await db
    .insert(coreReplicationCursors)
    .values({
      tableName: table,
      updatedAt: new Date(next.updatedAt),
      rowId: next.rowId,
    })
    .onConflictDoUpdate({
      target: coreReplicationCursors.tableName,
      set: {
        updatedAt: new Date(next.updatedAt),
        rowId: next.rowId,
      },
    });
}

export function compareCursor(a: ReplicationCursor, b: ReplicationCursor): number {
  const timeA = Date.parse(a.updatedAt);
  const timeB = Date.parse(b.updatedAt);
  if (timeA !== timeB) return timeA - timeB;
  return a.rowId.localeCompare(b.rowId);
}

export function maxCursor(
  current: ReplicationCursor,
  candidate: ReplicationCursor,
): ReplicationCursor {
  return compareCursor(candidate, current) > 0 ? candidate : current;
}

export { toIso };
