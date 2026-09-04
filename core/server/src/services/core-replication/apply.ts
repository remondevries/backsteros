import { and, eq } from "drizzle-orm";

import { db, sqlClient } from "../../db/index.js";
import {
  apiKeys,
  entityCounters,
  users,
  contacts,
  workspaceSettings,
  workspaces,
} from "../../db/schema.js";
import type { CoreReplicationRole } from "./config.js";
import { getCoreReplicationConfig } from "./config.js";
import type { ReplicatedTable } from "./constants.js";
import { REPLICATED_TABLES } from "./constants.js";
import {
  listTableColumns,
  setReplicationCursorsAfterBootstrap,
  tableExists,
  toIso,
} from "./cursors.js";
import { mergeWorkspaceSettingsForRole } from "./machine-local-settings.js";
import {
  documentContentMetaFromRow,
  shouldApplyByUpdatedAt,
  shouldApplyDocumentRow,
} from "./rules.js";
import { getTableSpec, rowIdFromPk, type KnownTable, type TableSpec } from "./tables.js";
import type {
  ReplicationApplyResponse,
  ReplicationChange,
  ReplicationRow,
} from "./types.js";

async function foreignKeyExists(
  table: typeof users | typeof contacts,
  id: string | null | undefined,
): Promise<boolean> {
  if (!id) return false;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  return Boolean(row);
}

export async function sanitizeApiKeyRow(
  row: ReplicationRow,
): Promise<ReplicationRow> {
  const userId = typeof row.user_id === "string" ? row.user_id : null;
  const contactId = typeof row.contact_id === "string" ? row.contact_id : null;
  return {
    ...row,
    user_id: userId && (await foreignKeyExists(users, userId)) ? userId : null,
    contact_id:
      contactId && (await foreignKeyExists(contacts, contactId))
        ? contactId
        : null,
  };
}

async function readLocalUpdatedAt(
  spec: TableSpec,
  row: ReplicationRow,
): Promise<Date | null> {
  if (!(await tableExists(spec.name))) {
    return null;
  }
  const pkWhere = spec.pk
    .map((col, index) => `"${col}" = $${index + 1}`)
    .join(" AND ");
  const pkValues = spec.pk.map((col) => row[col]);
  const query = `SELECT "${spec.updatedAtColumn}" AS updated_at FROM "${spec.name}" WHERE ${pkWhere} LIMIT 1`;
  const result = await sqlClient.unsafe(query, pkValues as never[]) as {
    updated_at: Date | string;
  }[];
  if (!result[0]) return null;
  return new Date(result[0].updated_at);
}

async function readLocalDocumentMeta(
  row: ReplicationRow,
): Promise<{
  updatedAt: Date;
  byteSize: number;
  contentVersion: number;
} | null> {
  if (!(await tableExists("documents"))) {
    return null;
  }
  const id = String(row.id);
  const result = await sqlClient.unsafe(
    `SELECT updated_at, byte_size, content_version FROM documents WHERE id = $1 LIMIT 1`,
    [id],
  ) as {
    updated_at: Date | string;
    byte_size: number | string | null;
    content_version: number | string | null;
  }[];
  if (!result[0]) return null;
  return {
    updatedAt: new Date(result[0].updated_at),
    byteSize: Number(result[0].byte_size ?? 0),
    contentVersion: Number(result[0].content_version ?? 0),
  };
}

async function applyDocumentsRow(
  row: ReplicationRow,
  localRole: CoreReplicationRole,
): Promise<"applied" | "skipped"> {
  const spec = getTableSpec("documents");
  if (!spec || !(await tableExists("documents"))) {
    return "skipped";
  }

  const remoteUpdatedAt = new Date(String(row[spec.updatedAtColumn]));
  const local = await readLocalDocumentMeta(row);
  const decision = shouldApplyDocumentRow(
    localRole,
    remoteUpdatedAt,
    local?.updatedAt ?? null,
    documentContentMetaFromRow(row),
    local
      ? { byteSize: local.byteSize, contentVersion: local.contentVersion }
      : null,
  );
  if (decision === "skip") {
    return "skipped";
  }

  // JS already applied document conflict rules; do not re-gate on updated_at.
  return applyGenericRowUnchecked(spec, row, { enforceUpdatedAtGate: false });
}

async function applyGenericRow(
  spec: TableSpec,
  row: ReplicationRow,
  localRole: CoreReplicationRole,
): Promise<"applied" | "skipped"> {
  if (!(await tableExists(spec.name))) {
    return "skipped";
  }

  if (spec.name === "documents") {
    return applyDocumentsRow(row, localRole);
  }

  const remoteUpdatedAt = new Date(String(row[spec.updatedAtColumn]));
  const localUpdatedAt = await readLocalUpdatedAt(spec, row);
  const decision = shouldApplyByUpdatedAt(
    spec.name as ReplicatedTable,
    localRole,
    remoteUpdatedAt,
    localUpdatedAt,
  );
  if (decision === "skip") {
    return "skipped";
  }

  return applyGenericRowUnchecked(spec, row);
}

async function applyGenericRowUnchecked(
  spec: TableSpec,
  row: ReplicationRow,
  options?: { enforceUpdatedAtGate?: boolean },
): Promise<"applied" | "skipped"> {
  // Drop columns the local schema does not have yet so a newer peer (or a
  // newer local pushing to an older peer after deploy lag) does not 500 the
  // whole apply — e.g. mapbox_access_token before migration 0081 on cloud.
  const knownColumns = await listTableColumns(spec.name);
  const columns = Object.keys(row).filter(
    (key) => row[key] !== undefined && knownColumns.has(key),
  );
  if (columns.length === 0) {
    return "skipped";
  }
  const colList = columns.map((col) => `"${col}"`).join(", ");
  // postgres.js cannot bind plain JS arrays/objects as query params (they
  // come from row_to_json / JSON transport for jsonb columns). Serialize and
  // cast; text[] columns use dedicated apply paths (e.g. api_keys).
  const placeholders = columns
    .map((col, index) =>
      isJsonBindValue(row[col]) ? `$${index + 1}::jsonb` : `$${index + 1}`,
    )
    .join(", ");
  const values = columns.map((col) => serializeBindValue(row[col]));
  const pkConflict = spec.pk.map((col) => `"${col}"`).join(", ");
  const setClause = columns
    .filter((col) => !spec.pk.includes(col))
    .map((col) => `"${col}" = EXCLUDED."${col}"`)
    .join(", ");

  // Generic tables keep an updated_at SQL gate. Documents already decided via
  // shouldApplyDocumentRow (content_version / empty-body) — do not let a
  // stricter updated_at WHERE no-op while we report "applied".
  const enforceUpdatedAtGate = options?.enforceUpdatedAtGate !== false;
  const whereClause = enforceUpdatedAtGate
    ? `WHERE "${spec.name}"."${spec.updatedAtColumn}" <= EXCLUDED."${spec.updatedAtColumn}"`
    : "";

  const query = `
    INSERT INTO "${spec.name}" (${colList})
    VALUES (${placeholders})
    ON CONFLICT (${pkConflict}) DO UPDATE
    SET ${setClause}
    ${whereClause}
  `;
  const result = await sqlClient.unsafe(query, values as never[]);
  const rowCount =
    typeof result === "object" &&
    result !== null &&
    "count" in result &&
    typeof (result as { count?: unknown }).count === "number"
      ? (result as { count: number }).count
      : Array.isArray(result)
        ? result.length
        : 0;
  return rowCount > 0 ? "applied" : "skipped";
}

function isJsonBindValue(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value)
  );
}

function serializeBindValue(value: unknown): unknown {
  if (isJsonBindValue(value)) {
    return JSON.stringify(value);
  }
  return value;
}

async function applyEntityCounterRow(
  row: ReplicationRow,
): Promise<"applied" | "skipped"> {
  const remoteUpdatedAt = new Date(String(row.updated_at));
  const workspaceId = String(row.workspace_id);
  const entity = String(row.entity);
  const scopeId = String(row.scope_id);
  const remoteNext = Number(row.next_value);

  const [existing] = await db
    .select({ updatedAt: entityCounters.updatedAt, nextValue: entityCounters.nextValue })
    .from(entityCounters)
    .where(
      and(
        eq(entityCounters.workspaceId, workspaceId),
        eq(entityCounters.entity, entity),
        eq(entityCounters.scopeId, scopeId),
      ),
    )
    .limit(1);

  if (existing && existing.updatedAt >= remoteUpdatedAt) {
    return "skipped";
  }

  await db
    .insert(entityCounters)
    .values({
      workspaceId,
      entity,
      scopeId,
      nextValue: remoteNext,
      updatedAt: remoteUpdatedAt,
    })
    .onConflictDoUpdate({
      target: [
        entityCounters.workspaceId,
        entityCounters.entity,
        entityCounters.scopeId,
      ],
      set: {
        nextValue: Math.max(existing?.nextValue ?? 0, remoteNext),
        updatedAt: remoteUpdatedAt,
      },
    });

  return "applied";
}

async function applyApiKeyRow(
  row: ReplicationRow,
  localRole: CoreReplicationRole,
): Promise<"applied" | "skipped"> {
  const sanitized = await sanitizeApiKeyRow(row);
  const remoteUpdatedAt = new Date(String(sanitized.updated_at));

  const [existing] = await db
    .select({ updatedAt: apiKeys.updatedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, String(sanitized.id)))
    .limit(1);

  const decision = shouldApplyByUpdatedAt(
    "api_keys",
    localRole,
    remoteUpdatedAt,
    existing?.updatedAt ?? null,
  );
  if (decision === "skip") {
    return "skipped";
  }

  await db
    .insert(apiKeys)
    .values({
      id: String(sanitized.id),
      workspaceId: String(sanitized.workspace_id),
      userId: sanitized.user_id ? String(sanitized.user_id) : null,
      name: String(sanitized.name),
      prefix: String(sanitized.prefix),
      keyHash: String(sanitized.key_hash),
      scopes: sanitized.scopes as string[],
      contactId: sanitized.contact_id ? String(sanitized.contact_id) : null,
      createdAt: new Date(String(sanitized.created_at)),
      revokedAt: sanitized.revoked_at ? new Date(String(sanitized.revoked_at)) : null,
      updatedAt: remoteUpdatedAt,
    })
    .onConflictDoUpdate({
      target: apiKeys.id,
      set: {
        workspaceId: String(sanitized.workspace_id),
        userId: sanitized.user_id ? String(sanitized.user_id) : null,
        name: String(sanitized.name),
        prefix: String(sanitized.prefix),
        keyHash: String(sanitized.key_hash),
        scopes: sanitized.scopes as string[],
        contactId: sanitized.contact_id ? String(sanitized.contact_id) : null,
        revokedAt: sanitized.revoked_at ? new Date(String(sanitized.revoked_at)) : null,
        updatedAt: remoteUpdatedAt,
      },
    });

  return "applied";
}

async function applyWorkspaceRow(row: ReplicationRow): Promise<"applied" | "skipped"> {
  const remoteUpdatedAt = new Date(String(row.updated_at));
  const id = String(row.id);
  const [existing] = await db
    .select({ updatedAt: workspaces.updatedAt })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (existing && existing.updatedAt >= remoteUpdatedAt) {
    return "skipped";
  }
  await db
    .insert(workspaces)
    .values({
      id,
      name: String(row.name),
      slug: String(row.slug),
      ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
      createdAt: new Date(String(row.created_at)),
      updatedAt: remoteUpdatedAt,
    })
    .onConflictDoUpdate({
      target: workspaces.id,
      set: {
        name: String(row.name),
        slug: String(row.slug),
        ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
        updatedAt: remoteUpdatedAt,
      },
    });
  return "applied";
}

async function applyWorkspaceSettingsRow(
  row: ReplicationRow,
  localRole: CoreReplicationRole,
): Promise<"applied" | "skipped"> {
  const remoteUpdatedAt = new Date(String(row.updated_at));
  const workspaceId = String(row.workspace_id);
  const [existing] = await db
    .select({
      updatedAt: workspaceSettings.updatedAt,
      settings: workspaceSettings.settings,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);

  const decision = shouldApplyByUpdatedAt(
    "workspace_settings",
    localRole,
    remoteUpdatedAt,
    existing?.updatedAt ?? null,
  );
  if (decision === "skip") {
    return "skipped";
  }

  const settings = mergeWorkspaceSettingsForRole(
    (row.settings ?? {}) as Record<string, unknown>,
    (existing?.settings ?? null) as Record<string, unknown> | null,
    localRole,
  );

  await db
    .insert(workspaceSettings)
    .values({
      workspaceId,
      settings,
      updatedAt: remoteUpdatedAt,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: {
        settings,
        updatedAt: remoteUpdatedAt,
      },
    });
  return "applied";
}

async function applyRow(
  table: KnownTable,
  row: ReplicationRow,
): Promise<"applied" | "skipped"> {
  const config = getCoreReplicationConfig();
  const localRole = config?.role ?? "local";
  const spec = getTableSpec(table);
  if (!spec) {
    return "skipped";
  }

  switch (table) {
    case "workspaces":
      return applyWorkspaceRow(row);
    case "workspace_settings":
      return applyWorkspaceSettingsRow(row, localRole);
    case "entity_counters":
      return applyEntityCounterRow(row);
    case "api_keys":
      return applyApiKeyRow(row, localRole);
    default:
      return applyGenericRow(spec, row, localRole);
  }
}

export async function applyRemoteChanges(
  table: KnownTable,
  changes: ReplicationChange[],
): Promise<ReplicationApplyResponse> {
  let applied = 0;
  let skipped = 0;

  for (const change of changes) {
    if (change.table !== table) {
      skipped += 1;
      continue;
    }
    const result = await applyRow(table, change.row);
    if (result === "applied") applied += 1;
    else skipped += 1;
  }

  return { applied, skipped };
}

export async function bootstrapTableFromPeer(
  table: KnownTable,
  changes: ReplicationChange[],
): Promise<ReplicationApplyResponse> {
  const spec = getTableSpec(table);
  const result = await applyRemoteChanges(table, changes);
  if (
    spec &&
    changes.length > 0 &&
    (REPLICATED_TABLES as readonly string[]).includes(spec.name)
  ) {
    const last = changes[changes.length - 1]!;
    await setReplicationCursorsAfterBootstrap(spec.name as ReplicatedTable, {
      updatedAt: toIso(last.row[spec.updatedAtColumn] as string | Date),
      rowId: rowIdFromPk(last.row, spec.pk),
    });
  }
  return result;
}
