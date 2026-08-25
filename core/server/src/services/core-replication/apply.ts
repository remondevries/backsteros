import { and, eq } from "drizzle-orm";

import { db, sqlClient } from "../../db/index.js";
import {
  apiKeys,
  contacts,
  entityCounters,
  tasks,
  users,
  workspaceSettings,
  workspaces,
} from "../../db/schema.js";
import type { CoreReplicationRole } from "./config.js";
import { getCoreReplicationConfig } from "./config.js";
import type { ReplicatedTable } from "./constants.js";
import { REPLICATED_TABLES } from "./constants.js";
import {
  setReplicationCursor,
  tableExists,
  toIso,
} from "./cursors.js";
import { shouldApplyByUpdatedAt } from "./rules.js";
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

async function applyGenericRow(
  spec: TableSpec,
  row: ReplicationRow,
  localRole: CoreReplicationRole,
): Promise<"applied" | "skipped"> {
  if (!(await tableExists(spec.name))) {
    return "skipped";
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

  const columns = Object.keys(row).filter((key) => row[key] !== undefined);
  const colList = columns.map((col) => `"${col}"`).join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const values = columns.map((col) => row[col]);
  const pkConflict = spec.pk.map((col) => `"${col}"`).join(", ");
  const setClause = columns
    .filter((col) => !spec.pk.includes(col))
    .map((col) => `"${col}" = EXCLUDED."${col}"`)
    .join(", ");

  const query = `
    INSERT INTO "${spec.name}" (${colList})
    VALUES (${placeholders})
    ON CONFLICT (${pkConflict}) DO UPDATE
    SET ${setClause}
    WHERE "${spec.name}"."${spec.updatedAtColumn}" <= EXCLUDED."${spec.updatedAtColumn}"
  `;
  await sqlClient.unsafe(query, values as never[]);
  return "applied";
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
    .select({ updatedAt: workspaceSettings.updatedAt })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);

  const decision = shouldApplyByUpdatedAt(
    "meeting_scheduling_settings",
    localRole,
    remoteUpdatedAt,
    existing?.updatedAt ?? null,
  );
  if (decision === "skip") {
    return "skipped";
  }

  await db
    .insert(workspaceSettings)
    .values({
      workspaceId,
      settings: (row.settings ?? {}) as Record<string, unknown>,
      updatedAt: remoteUpdatedAt,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: {
        settings: (row.settings ?? {}) as Record<string, unknown>,
        updatedAt: remoteUpdatedAt,
      },
    });
  return "applied";
}

async function applyTaskRow(
  row: ReplicationRow,
  localRole: CoreReplicationRole,
): Promise<"applied" | "skipped"> {
  const remoteUpdatedAt = new Date(String(row.updated_at));
  const id = String(row.id);
  const [existing] = await db
    .select({ updatedAt: tasks.updatedAt })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);

  const decision = shouldApplyByUpdatedAt(
    "tasks",
    localRole,
    remoteUpdatedAt,
    existing?.updatedAt ?? null,
  );
  if (decision === "skip") {
    return "skipped";
  }

  await db
    .insert(tasks)
    .values({
      id,
      workspaceId: String(row.workspace_id),
      projectId: row.project_id ? String(row.project_id) : null,
      contactId: row.contact_id ? String(row.contact_id) : null,
      assigneeId: row.assignee_id ? String(row.assignee_id) : null,
      number: Number(row.number),
      title: String(row.title),
      description: row.description ? String(row.description) : null,
      status: String(row.status ?? "ready_to_start"),
      priority: Number(row.priority ?? 0),
      sortOrder: Number(row.sort_order ?? 0),
      dueDate: row.due_date ? new Date(String(row.due_date)) : null,
      triagedAt: row.triaged_at ? new Date(String(row.triaged_at)) : null,
      inbox: Boolean(row.inbox),
      links: (row.links ?? []) as { id: string; url: string; createdAt: string }[],
      agentChatId: row.agent_chat_id ? String(row.agent_chat_id) : null,
      habitId: row.habit_id ? String(row.habit_id) : null,
      legacySource: row.legacy_source ? String(row.legacy_source) : null,
      completedAt: row.completed_at ? new Date(String(row.completed_at)) : null,
      agentCreatedAt: row.agent_created_at
        ? new Date(String(row.agent_created_at))
        : null,
      agentInboxApprovedAt: row.agent_inbox_approved_at
        ? new Date(String(row.agent_inbox_approved_at))
        : null,
      createdAt: new Date(String(row.created_at)),
      updatedAt: remoteUpdatedAt,
      deletedAt: row.deleted_at ? new Date(String(row.deleted_at)) : null,
    })
    .onConflictDoUpdate({
      target: tasks.id,
      set: {
        title: String(row.title),
        description: row.description ? String(row.description) : null,
        status: String(row.status ?? "ready_to_start"),
        priority: Number(row.priority ?? 0),
        sortOrder: Number(row.sort_order ?? 0),
        dueDate: row.due_date ? new Date(String(row.due_date)) : null,
        legacySource: row.legacy_source ? String(row.legacy_source) : null,
        updatedAt: remoteUpdatedAt,
        deletedAt: row.deleted_at ? new Date(String(row.deleted_at)) : null,
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
    case "tasks":
      return applyTaskRow(row, localRole);
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
    await setReplicationCursor(spec.name as ReplicatedTable, {
      updatedAt: toIso(last.row[spec.updatedAtColumn] as string | Date),
      rowId: rowIdFromPk(last.row, spec.pk),
    });
  }
  return result;
}
