import { sqlClient } from "../../db/index.js";
import type { ReplicatedTable } from "./constants.js";
import type { ReplicationCursor } from "./types.js";
import { arrayElementTypeFromUdtName } from "./bind-values.js";
import {
  compareCursor,
  maxCursor,
  toIso,
} from "./cursor-order.js";

export type ReplicationCursorDirection = "pull" | "push";
export { compareCursor, maxCursor, toIso };

const EPOCH: ReplicationCursor = {
  updatedAt: new Date(0).toISOString(),
  rowId: "",
};

type CursorRow = {
  pull_updated_at: string | null;
  pull_row_id: string | null;
  push_updated_at: string | null;
  push_row_id: string | null;
  updated_at: string;
  row_id: string;
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

/**
 * Array columns of a public table → element type (`allowed_domains` → `text`).
 * Generic replication apply must rebuild these instead of binding ::jsonb.
 */
export async function listTableArrayColumns(
  tableName: string,
): Promise<Map<string, string>> {
  const rows = await sqlClient<{ column_name: string; udt_name: string }[]>`
    SELECT column_name, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND data_type = 'ARRAY'
  `;
  const result = new Map<string, string>();
  for (const row of rows) {
    const element = arrayElementTypeFromUdtName(row.udt_name);
    if (element) result.set(row.column_name, element);
  }
  return result;
}

/** Live column names for a public table (used to tolerate peer schema lag). */
export async function listTableColumns(tableName: string): Promise<Set<string>> {
  const rows = await sqlClient<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
  `;
  return new Set(rows.map((row) => row.column_name));
}

function cursorFromTextRow(
  row: CursorRow | undefined,
  direction: ReplicationCursorDirection,
): ReplicationCursor {
  if (!row) return { ...EPOCH };

  if (direction === "pull") {
    const updatedAt = row.pull_updated_at ?? row.updated_at;
    const rowId =
      row.pull_row_id && row.pull_row_id.length > 0
        ? row.pull_row_id
        : row.row_id;
    return { updatedAt: toIso(updatedAt), rowId };
  }

  const updatedAt = row.push_updated_at ?? row.updated_at;
  const rowId =
    row.push_row_id && row.push_row_id.length > 0 ? row.push_row_id : row.row_id;
  return { updatedAt: toIso(updatedAt), rowId };
}

export async function getReplicationCursor(
  table: ReplicatedTable,
  direction: ReplicationCursorDirection = "pull",
): Promise<ReplicationCursor> {
  // ::text keeps Postgres microseconds; never pass through JS Date (ms only).
  const rows = await sqlClient<CursorRow[]>`
    SELECT
      pull_updated_at::text AS pull_updated_at,
      pull_row_id,
      push_updated_at::text AS push_updated_at,
      push_row_id,
      updated_at::text AS updated_at,
      row_id
    FROM core_replication_cursors
    WHERE table_name = ${table}
    LIMIT 1
  `;

  return cursorFromTextRow(rows[0], direction);
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

  // Bind ISO text with ::timestamptz — never `new Date(...)`, which drops µs.
  const nextIso = toIso(next.updatedAt);
  const epochIso = EPOCH.updatedAt;

  if (direction === "pull") {
    await sqlClient`
      INSERT INTO core_replication_cursors (
        table_name,
        updated_at,
        row_id,
        pull_updated_at,
        pull_row_id,
        push_updated_at,
        push_row_id
      ) VALUES (
        ${table},
        ${nextIso}::timestamptz,
        ${next.rowId},
        ${nextIso}::timestamptz,
        ${next.rowId},
        ${epochIso}::timestamptz,
        ${""}
      )
      ON CONFLICT (table_name) DO UPDATE SET
        pull_updated_at = EXCLUDED.pull_updated_at,
        pull_row_id = EXCLUDED.pull_row_id,
        updated_at = EXCLUDED.updated_at,
        row_id = EXCLUDED.row_id
    `;
    return;
  }

  await sqlClient`
    INSERT INTO core_replication_cursors (
      table_name,
      updated_at,
      row_id,
      pull_updated_at,
      pull_row_id,
      push_updated_at,
      push_row_id
    ) VALUES (
      ${table},
      ${nextIso}::timestamptz,
      ${next.rowId},
      ${epochIso}::timestamptz,
      ${""},
      ${nextIso}::timestamptz,
      ${next.rowId}
    )
    ON CONFLICT (table_name) DO UPDATE SET
      push_updated_at = EXCLUDED.push_updated_at,
      push_row_id = EXCLUDED.push_row_id
  `;
}

/** Set both watermarks after bootstrap so neither direction re-sends the snapshot. */
export async function setReplicationCursorsAfterBootstrap(
  table: ReplicatedTable,
  cursor: ReplicationCursor,
): Promise<void> {
  await setReplicationCursor(table, cursor, "pull");
  await setReplicationCursor(table, cursor, "push");
}
