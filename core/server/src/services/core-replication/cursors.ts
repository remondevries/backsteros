import { eq } from "drizzle-orm";

import { db, sqlClient } from "../../db/index.js";
import { coreReplicationCursors } from "../../db/schema.js";
import type { ReplicatedTable } from "./constants.js";
import type { ReplicationCursor } from "./types.js";
import { compareCursor, maxCursor, toIso } from "./cursor-order.js";

export type ReplicationCursorDirection = "pull" | "push";
export { compareCursor, maxCursor, toIso };

const EPOCH: ReplicationCursor = {
  updatedAt: new Date(0).toISOString(),
  rowId: "",
};

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

function cursorFromRow(
  row: typeof coreReplicationCursors.$inferSelect | undefined,
  direction: ReplicationCursorDirection,
): ReplicationCursor {
  if (!row) return { ...EPOCH };

  if (direction === "pull") {
    const updatedAt = row.pullUpdatedAt ?? row.updatedAt;
    const rowId =
      row.pullRowId && row.pullRowId.length > 0
        ? row.pullRowId
        : row.rowId;
    return { updatedAt: toIso(updatedAt), rowId };
  }

  const updatedAt = row.pushUpdatedAt ?? row.updatedAt;
  const rowId =
    row.pushRowId && row.pushRowId.length > 0 ? row.pushRowId : row.rowId;
  return { updatedAt: toIso(updatedAt), rowId };
}

export async function getReplicationCursor(
  table: ReplicatedTable,
  direction: ReplicationCursorDirection = "pull",
): Promise<ReplicationCursor> {
  const [row] = await db
    .select()
    .from(coreReplicationCursors)
    .where(eq(coreReplicationCursors.tableName, table))
    .limit(1);

  return cursorFromRow(row, direction);
}

export async function setReplicationCursor(
  table: ReplicatedTable,
  cursor: ReplicationCursor,
  direction: ReplicationCursorDirection = "pull",
): Promise<void> {
  // Never move a cursor backwards — overlapping ticks / stalled bulk pushes
  // must not clobber a newer tip after bootstrap or a concurrent tick.
  const existing = await getReplicationCursor(table, direction);
  const next = maxCursor(existing, cursor);
  if (compareCursor(next, existing) <= 0 && existing.rowId !== "") {
    return;
  }

  const nextDate = new Date(next.updatedAt);
  if (direction === "pull") {
    await db
      .insert(coreReplicationCursors)
      .values({
        tableName: table,
        updatedAt: nextDate,
        rowId: next.rowId,
        pullUpdatedAt: nextDate,
        pullRowId: next.rowId,
        pushUpdatedAt: new Date(0),
        pushRowId: "",
      })
      .onConflictDoUpdate({
        target: coreReplicationCursors.tableName,
        set: {
          pullUpdatedAt: nextDate,
          pullRowId: next.rowId,
          // Keep legacy columns aligned with pull for older readers.
          updatedAt: nextDate,
          rowId: next.rowId,
        },
      });
    return;
  }

  await db
    .insert(coreReplicationCursors)
    .values({
      tableName: table,
      updatedAt: nextDate,
      rowId: next.rowId,
      pullUpdatedAt: new Date(0),
      pullRowId: "",
      pushUpdatedAt: nextDate,
      pushRowId: next.rowId,
    })
    .onConflictDoUpdate({
      target: coreReplicationCursors.tableName,
      set: {
        pushUpdatedAt: nextDate,
        pushRowId: next.rowId,
      },
    });
}

/** Set both watermarks after bootstrap so neither direction re-sends the snapshot. */
export async function setReplicationCursorsAfterBootstrap(
  table: ReplicatedTable,
  cursor: ReplicationCursor,
): Promise<void> {
  await setReplicationCursor(table, cursor, "pull");
  await setReplicationCursor(table, cursor, "push");
}
