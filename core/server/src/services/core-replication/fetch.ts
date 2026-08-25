import { sqlClient } from "../../db/index.js";
import type { BootstrapTable, ReplicatedTable } from "./constants.js";
import {
  compareCursor,
  maxCursor,
  tableExists,
  toIso,
} from "./cursors.js";
import {
  getTableSpec,
  listBootstrapTableSpecs,
  listReplicatedTableSpecs,
  rowIdFromPk,
  type KnownTable,
  type TableSpec,
} from "./tables.js";
import type { ReplicationChange, ReplicationCursor } from "./types.js";

const PAGE_SIZE = 100;

function pkOrderClause(spec: TableSpec): string {
  return spec.pk.map((col) => `"${col}"`).join(", ");
}

function pkCursorPredicate(spec: TableSpec, since: ReplicationCursor): string {
  const updatedCol = spec.updatedAtColumn;
  const pkCols = spec.pk;
  if (pkCols.length === 1) {
    const pk = pkCols[0]!;
    return `(
      "${updatedCol}" > $1::timestamptz
      OR ("${updatedCol}" = $1::timestamptz AND "${pk}" > $2)
    )`;
  }
  const pkExpr = pkCols.map((col) => `"${col}"`).join(" || char(0) || ");
  return `(
    "${updatedCol}" > $1::timestamptz
    OR ("${updatedCol}" = $1::timestamptz AND (${pkExpr}) > $2)
  )`;
}

async function fetchRowsSince(
  spec: TableSpec,
  since: ReplicationCursor,
): Promise<{ changes: ReplicationChange[]; cursor: ReplicationCursor }> {
  const whereParts = [pkCursorPredicate(spec, since)];
  if (spec.whereSql) {
    whereParts.push(`(${spec.whereSql})`);
  }
  const whereClause = whereParts.join(" AND ");
  const orderClause = `"${spec.updatedAtColumn}", ${pkOrderClause(spec)}`;

  const query = `
    SELECT row_to_json(t)::jsonb AS row
    FROM "${spec.name}" t
    WHERE ${whereClause}
    ORDER BY ${orderClause}
    LIMIT ${PAGE_SIZE}
  `;

  const rows = await sqlClient.unsafe(query, [
    since.updatedAt,
    since.rowId,
  ]) as { row: Record<string, unknown> }[];

  let cursor = since;
  const changes: ReplicationChange[] = rows.map(({ row }) => {
    const updatedAt = toIso(row[spec.updatedAtColumn] as string | Date);
    const rowId = rowIdFromPk(row, spec.pk);
    cursor = maxCursor(cursor, { updatedAt, rowId });
    return {
      table: spec.name,
      row,
    };
  });

  return { changes, cursor };
}

async function fetchAllRows(spec: TableSpec): Promise<ReplicationChange[]> {
  const whereClause = spec.whereSql ? `WHERE ${spec.whereSql}` : "";
  const orderClause = `"${spec.updatedAtColumn}", ${pkOrderClause(spec)}`;
  const query = `
    SELECT row_to_json(t)::jsonb AS row
    FROM "${spec.name}" t
    ${whereClause}
    ORDER BY ${orderClause}
  `;
  const rows = await sqlClient.unsafe(query) as { row: Record<string, unknown> }[];
  return rows.map(({ row }) => ({
    table: spec.name as ReplicatedTable,
    row,
  }));
}

async function fetchForSpec(
  spec: TableSpec,
  since: ReplicationCursor,
): Promise<{ changes: ReplicationChange[]; cursor: ReplicationCursor }> {
  if (!(await tableExists(spec.name))) {
    return { changes: [], cursor: since };
  }
  return fetchRowsSince(spec, since);
}

export async function fetchLocalChanges(
  table: ReplicatedTable,
  since: ReplicationCursor,
): Promise<{ changes: ReplicationChange[]; cursor: ReplicationCursor }> {
  const spec = getTableSpec(table);
  if (!spec) {
    return { changes: [], cursor: since };
  }
  return fetchForSpec(spec, since);
}

export async function fetchAllLocalRows(
  table: KnownTable,
): Promise<ReplicationChange[]> {
  const spec = getTableSpec(table);
  if (!spec || !(await tableExists(spec.name))) {
    return [];
  }
  return fetchAllRows(spec);
}

export async function listActiveReplicatedTables(): Promise<ReplicatedTable[]> {
  const active: ReplicatedTable[] = [];
  for (const spec of listReplicatedTableSpecs()) {
    if (spec.optional && !(await tableExists(spec.name))) {
      continue;
    }
    if (!(await tableExists(spec.name))) {
      continue;
    }
    active.push(spec.name as ReplicatedTable);
  }
  return active;
}

export async function listActiveBootstrapTables(): Promise<BootstrapTable[]> {
  const active: BootstrapTable[] = [];
  for (const spec of listBootstrapTableSpecs()) {
    if (spec.optional && !(await tableExists(spec.name))) {
      continue;
    }
    if (!(await tableExists(spec.name))) {
      continue;
    }
    active.push(spec.name as BootstrapTable);
  }
  return active;
}

export { compareCursor };
