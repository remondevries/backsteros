import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import type { TimeEntry } from "@backsteros/contracts";

import { db } from "../../db/index.js";
import {
  documents,
  meetings,
  tasks,
  timeEntries,
} from "../../db/schema.js";
import { newId } from "../../lib/crypto.js";
import { recomputeEntityTrackedDurationCache } from "./entity-cache.js";
import type {
  ApplyEntityTrackedDurationInput,
  CheckpointOpenTimeEntryInput,
  CreateTimeEntryInput,
  DbExecutor,
  EntityContext,
  ListTimeEntriesQuery,
  StartOpenTimeEntryInput,
  StopOpenTimeEntryInput,
  StopTimeEntryInput,
  TimeEntryActor,
  TimeEntryEntityType,
  TimeEntryRow,
  TimeEntrySource,
  TimeEntrySummaryQuery,
  UpdateTimeEntryInput,
} from "./types.js";

function toIso(value: Date | null | undefined): string | null {
  if (value == null) return null;
  return value.toISOString();
}

export function toTimeEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    entityType: row.entityType as TimeEntry["entityType"],
    entityId: row.entityId,
    actorUserId: row.actorUserId ?? null,
    actorContactId: row.actorContactId ?? null,
    startedAt: row.startedAt.toISOString(),
    endedAt: toIso(row.endedAt),
    durationSeconds: Math.max(0, row.durationSeconds ?? 0),
    source: row.source as TimeEntry["source"],
    note: row.note ?? null,
    projectId: row.projectId ?? null,
    organizationId: row.organizationId ?? null,
    legacyStartActivityId: row.legacyStartActivityId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

export async function resolveEntityContext(
  workspaceId: string,
  entityType: TimeEntryEntityType,
  entityId: string,
  executor: DbExecutor = db,
): Promise<EntityContext> {
  if (entityType === "task") {
    const [row] = await executor
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        relatedOrganizationIds: tasks.relatedOrganizationIds,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.id, entityId),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    const related = Array.isArray(row?.relatedOrganizationIds)
      ? row.relatedOrganizationIds
      : [];
    return {
      exists: Boolean(row),
      projectId: row?.projectId ?? null,
      organizationId: related[0] ?? null,
    };
  }
  if (entityType === "meeting") {
    const [row] = await executor
      .select({
        id: meetings.id,
        projectId: meetings.projectId,
        organizationId: meetings.organizationId,
      })
      .from(meetings)
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          eq(meetings.id, entityId),
          isNull(meetings.deletedAt),
        ),
      )
      .limit(1);
    return {
      exists: Boolean(row),
      projectId: row?.projectId ?? null,
      organizationId: row?.organizationId ?? null,
    };
  }
  const [row] = await executor
    .select({
      id: documents.id,
      projectId: documents.projectId,
    })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.id, entityId),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  return {
    exists: Boolean(row),
    projectId: row?.projectId ?? null,
    organizationId: null,
  };
}

export async function findOpenTimeEntry(
  workspaceId: string,
  entityType: TimeEntryEntityType,
  entityId: string,
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const [row] = await executor
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.entityType, entityType),
        eq(timeEntries.entityId, entityId),
        isNull(timeEntries.endedAt),
        isNull(timeEntries.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getTimeEntry(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const [row] = await executor
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.id, id),
        isNull(timeEntries.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

function encodeCursor(startedAt: Date, id: string): string {
  return Buffer.from(`${startedAt.toISOString()}|${id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(
  cursor: string | undefined,
): { startedAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [iso, id] = raw.split("|");
    if (!iso || !id) return null;
    const startedAt = new Date(iso);
    if (Number.isNaN(startedAt.getTime())) return null;
    return { startedAt, id };
  } catch {
    return null;
  }
}

export async function listTimeEntries(
  workspaceId: string,
  query: ListTimeEntriesQuery = {},
  executor: DbExecutor = db,
): Promise<{ rows: TimeEntryRow[]; nextCursor: string | null }> {
  const limit = Math.min(200, Math.max(1, query.limit ?? 50));
  const cursor = decodeCursor(query.cursor);
  const conditions = [
    eq(timeEntries.workspaceId, workspaceId),
    isNull(timeEntries.deletedAt),
  ];
  if (query.entityType) {
    conditions.push(eq(timeEntries.entityType, query.entityType));
  }
  if (query.entityId) {
    conditions.push(eq(timeEntries.entityId, query.entityId));
  }
  if (query.projectId) {
    conditions.push(eq(timeEntries.projectId, query.projectId));
  }
  if (query.actorContactId) {
    conditions.push(eq(timeEntries.actorContactId, query.actorContactId));
  }
  if (query.openOnly === true) {
    conditions.push(isNull(timeEntries.endedAt));
  }
  if (query.from) {
    conditions.push(gte(timeEntries.startedAt, new Date(query.from)));
  }
  if (query.to) {
    conditions.push(lte(timeEntries.startedAt, new Date(query.to)));
  }
  if (cursor) {
    conditions.push(
      sql`(${timeEntries.startedAt}, ${timeEntries.id}) < (${cursor.startedAt.toISOString()}::timestamptz, ${cursor.id})`,
    );
  }

  const rows = await executor
    .select()
    .from(timeEntries)
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt), desc(timeEntries.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last
      ? encodeCursor(last.startedAt, last.id)
      : null;
  return { rows: page, nextCursor };
}

export async function startOpenTimeEntry(
  workspaceId: string,
  input: StartOpenTimeEntryInput,
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const existing = await findOpenTimeEntry(
    workspaceId,
    input.entityType,
    input.entityId,
    executor,
  );
  if (existing) return existing;

  const ctx = await resolveEntityContext(
    workspaceId,
    input.entityType,
    input.entityId,
    executor,
  );
  if (!ctx.exists) return null;

  const now = input.startedAt ?? new Date();
  const durationSeconds = Math.max(0, Math.round(input.durationSeconds ?? 0));
  const [row] = await executor
    .insert(timeEntries)
    .values({
      id: input.id ?? newId(),
      workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: input.actor?.userId ?? null,
      actorContactId: input.actor?.contactId ?? null,
      startedAt: now,
      endedAt: null,
      durationSeconds,
      source: input.source ?? "timer",
      note: input.note ?? null,
      projectId: input.projectId !== undefined ? input.projectId : ctx.projectId,
      organizationId:
        input.organizationId !== undefined
          ? input.organizationId
          : ctx.organizationId,
      legacyStartActivityId: input.legacyStartActivityId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (row) {
    await recomputeEntityTrackedDurationCache(
      workspaceId,
      input.entityType,
      input.entityId,
      executor,
      now,
    );
  }
  return row ?? null;
}

export async function checkpointOpenTimeEntry(
  workspaceId: string,
  input: CheckpointOpenTimeEntryInput,
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const open = await findOpenTimeEntry(
    workspaceId,
    input.entityType,
    input.entityId,
    executor,
  );
  if (!open) return null;

  const now = input.now ?? new Date();
  const wallSeconds = Math.max(
    0,
    Math.floor((now.getTime() - open.startedAt.getTime()) / 1000),
  );
  // Soft checkpoint stores the full entity-facing session elapsed for this
  // open row. Callers pass the entity total; convert to this session's share
  // when the passed value looks like a full-entity total (>= current open).
  const requested = Math.max(0, Math.round(input.durationSeconds));
  const sessionSeconds = Math.max(wallSeconds, requested);

  const [row] = await executor
    .update(timeEntries)
    .set({
      durationSeconds: sessionSeconds,
      updatedAt: now,
    })
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.id, open.id),
        isNull(timeEntries.endedAt),
        isNull(timeEntries.deletedAt),
      ),
    )
    .returning();

  if (row) {
    await recomputeEntityTrackedDurationCache(
      workspaceId,
      input.entityType,
      input.entityId,
      executor,
      now,
    );
  }
  return row ?? null;
}

/**
 * Soft-checkpoint when a client PATCHes the entity total while a timer is open.
 * Sets open-entry duration to max(0, nextTotal - closedSum) so the cache SUM matches.
 */
export async function checkpointOpenFromEntityTotal(
  workspaceId: string,
  entityType: TimeEntryEntityType,
  entityId: string,
  nextEntityTotalSeconds: number,
  executor: DbExecutor = db,
  now: Date = new Date(),
): Promise<TimeEntryRow | null> {
  const open = await findOpenTimeEntry(
    workspaceId,
    entityType,
    entityId,
    executor,
  );
  if (!open) return null;

  const [closed] = await executor
    .select({
      total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.entityType, entityType),
        eq(timeEntries.entityId, entityId),
        isNull(timeEntries.deletedAt),
        sql`${timeEntries.endedAt} is not null`,
        sql`${timeEntries.id} <> ${open.id}`,
      ),
    );
  const closedSum = Math.max(0, Math.round(Number(closed?.total ?? 0)));
  const sessionSeconds = Math.max(
    0,
    Math.round(nextEntityTotalSeconds) - closedSum,
  );

  const [row] = await executor
    .update(timeEntries)
    .set({
      durationSeconds: sessionSeconds,
      updatedAt: now,
    })
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.id, open.id),
      ),
    )
    .returning();

  if (row) {
    await recomputeEntityTrackedDurationCache(
      workspaceId,
      entityType,
      entityId,
      executor,
      now,
    );
  }
  return row ?? null;
}

export async function stopOpenTimeEntry(
  workspaceId: string,
  input: StopOpenTimeEntryInput,
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const open = await findOpenTimeEntry(
    workspaceId,
    input.entityType,
    input.entityId,
    executor,
  );
  if (!open) return null;

  const now = input.now ?? new Date();
  const endedAt = input.endedAt ?? now;
  const wallSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - open.startedAt.getTime()) / 1000),
  );
  const durationSeconds =
    input.durationSeconds != null
      ? Math.max(0, Math.round(input.durationSeconds))
      : Math.max(open.durationSeconds ?? 0, wallSeconds);

  const [row] = await executor
    .update(timeEntries)
    .set({
      endedAt,
      durationSeconds,
      updatedAt: now,
    })
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.id, open.id),
        isNull(timeEntries.endedAt),
      ),
    )
    .returning();

  if (row) {
    await recomputeEntityTrackedDurationCache(
      workspaceId,
      input.entityType,
      input.entityId,
      executor,
      now,
    );
  }
  return row ?? null;
}

export async function stopTimeEntryById(
  workspaceId: string,
  id: string,
  input: StopTimeEntryInput = {},
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const existing = await getTimeEntry(workspaceId, id, executor);
  if (!existing || existing.endedAt != null) return existing;

  return stopOpenTimeEntry(
    workspaceId,
    {
      entityType: existing.entityType as TimeEntryEntityType,
      entityId: existing.entityId,
      endedAt: input.endedAt ? new Date(input.endedAt) : undefined,
      durationSeconds: input.durationSeconds,
    },
    executor,
  );
}

export async function createTimeEntry(
  workspaceId: string,
  input: CreateTimeEntryInput,
  actor: TimeEntryActor | null = null,
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const open =
    input.open === true ||
    (input.open !== false && input.endedAt == null);

  if (open) {
    return startOpenTimeEntry(
      workspaceId,
      {
        id: input.id,
        entityType: input.entityType,
        entityId: input.entityId,
        actor: {
          userId: actor?.userId ?? null,
          contactId:
            input.actorContactId !== undefined
              ? input.actorContactId
              : (actor?.contactId ?? null),
        },
        startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
        durationSeconds: input.durationSeconds ?? 0,
        source: input.source ?? "timer",
        note: input.note,
        projectId: input.projectId,
        organizationId: input.organizationId,
      },
      executor,
    );
  }

  const ctx = await resolveEntityContext(
    workspaceId,
    input.entityType,
    input.entityId,
    executor,
  );
  if (!ctx.exists) return null;

  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  let endedAt = input.endedAt ? new Date(input.endedAt) : null;
  let durationSeconds =
    input.durationSeconds != null
      ? Math.max(0, Math.round(input.durationSeconds))
      : null;
  if (durationSeconds == null && endedAt) {
    durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
    );
  }
  if (durationSeconds == null) return null;
  if (!endedAt && durationSeconds > 0) {
    endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
  }
  if (!endedAt) return null;

  const now = new Date();
  const [row] = await executor
    .insert(timeEntries)
    .values({
      id: input.id ?? newId(),
      workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: actor?.userId ?? null,
      actorContactId:
        input.actorContactId !== undefined
          ? input.actorContactId
          : (actor?.contactId ?? null),
      startedAt,
      endedAt,
      durationSeconds,
      source: input.source ?? "manual",
      note: input.note ?? null,
      projectId: input.projectId !== undefined ? input.projectId : ctx.projectId,
      organizationId:
        input.organizationId !== undefined
          ? input.organizationId
          : ctx.organizationId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (row) {
    await recomputeEntityTrackedDurationCache(
      workspaceId,
      input.entityType,
      input.entityId,
      executor,
      now,
    );
  }
  return row ?? null;
}

export async function updateTimeEntry(
  workspaceId: string,
  id: string,
  input: UpdateTimeEntryInput,
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const existing = await getTimeEntry(workspaceId, id, executor);
  if (!existing) return null;

  const now = new Date();
  const startedAt = input.startedAt
    ? new Date(input.startedAt)
    : existing.startedAt;
  const endedAt =
    input.endedAt === undefined
      ? existing.endedAt
      : input.endedAt == null
        ? null
        : new Date(input.endedAt);
  let durationSeconds =
    input.durationSeconds !== undefined
      ? Math.max(0, Math.round(input.durationSeconds))
      : existing.durationSeconds;

  if (
    input.durationSeconds === undefined &&
    endedAt &&
    (input.startedAt !== undefined || input.endedAt !== undefined)
  ) {
    durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
    );
  }

  const [row] = await executor
    .update(timeEntries)
    .set({
      ...(input.actorContactId !== undefined
        ? { actorContactId: input.actorContactId }
        : {}),
      startedAt,
      endedAt,
      durationSeconds,
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.organizationId !== undefined
        ? { organizationId: input.organizationId }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.id, id),
        isNull(timeEntries.deletedAt),
      ),
    )
    .returning();

  if (row) {
    await recomputeEntityTrackedDurationCache(
      workspaceId,
      existing.entityType as TimeEntryEntityType,
      existing.entityId,
      executor,
      now,
    );
  }
  return row ?? null;
}

export async function deleteTimeEntry(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const existing = await getTimeEntry(workspaceId, id, executor);
  if (!existing) return null;

  const now = new Date();
  const [row] = await executor
    .update(timeEntries)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.id, id),
        isNull(timeEntries.deletedAt),
      ),
    )
    .returning();

  if (row) {
    await recomputeEntityTrackedDurationCache(
      workspaceId,
      existing.entityType as TimeEntryEntityType,
      existing.entityId,
      executor,
      now,
    );
  }
  return row ?? null;
}

export async function deleteTimeEntryByLegacyStartActivity(
  workspaceId: string,
  legacyStartActivityId: string,
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const [existing] = await executor
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.legacyStartActivityId, legacyStartActivityId),
        isNull(timeEntries.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) return null;
  return deleteTimeEntry(workspaceId, existing.id, executor);
}

/**
 * Align ledger to a new entity total (manual edit / legacy PATCH).
 * Open timer → checkpoint session share. Otherwise insert an adjustment row.
 */
export async function applyEntityTrackedDuration(
  workspaceId: string,
  input: ApplyEntityTrackedDurationInput,
  executor: DbExecutor = db,
): Promise<TimeEntryRow | null> {
  const now = input.now ?? new Date();
  const next = Math.max(0, Math.round(input.nextDurationSeconds ?? 0));
  const open = await findOpenTimeEntry(
    workspaceId,
    input.entityType,
    input.entityId,
    executor,
  );
  if (open) {
    return checkpointOpenFromEntityTotal(
      workspaceId,
      input.entityType,
      input.entityId,
      next,
      executor,
      now,
    );
  }

  const [sumRow] = await executor
    .select({
      total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.entityType, input.entityType),
        eq(timeEntries.entityId, input.entityId),
        isNull(timeEntries.deletedAt),
      ),
    );
  const current = Math.max(0, Math.round(Number(sumRow?.total ?? 0)));
  const delta = next - current;
  if (delta === 0) return null;

  const ctx = await resolveEntityContext(
    workspaceId,
    input.entityType,
    input.entityId,
    executor,
  );
  if (!ctx.exists) return null;

  const durationSeconds = Math.abs(delta);
  const startedAt = now;
  const endedAt = new Date(now.getTime() + Math.max(1, durationSeconds) * 1000);
  // Negative adjustments store duration and a note; summary uses signed via source.
  // For v1 we only support positive bump; negative uses duration with adjustment note.
  const [row] = await executor
    .insert(timeEntries)
    .values({
      id: newId(),
      workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: input.actor?.userId ?? null,
      actorContactId: input.actor?.contactId ?? null,
      startedAt,
      endedAt,
      durationSeconds: delta > 0 ? durationSeconds : 0,
      source: "adjustment",
      note:
        delta < 0
          ? `adjustment:-${durationSeconds}`
          : `adjustment:+${durationSeconds}`,
      projectId: ctx.projectId,
      organizationId: ctx.organizationId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (delta < 0) {
    // Soft-delete newest closed entries until the sum matches (keep history).
    // Simpler path: set duration on this adjustment to 0 and reduce other rows
    // is messy; instead recompute by writing the cache directly after deleting
    // the zero row and inserting a corrective approach — trim from open history.
    if (row) {
      await executor
        .update(timeEntries)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.id, row.id),
          ),
        );
    }
    await trimEntityDurationToTotal(
      workspaceId,
      input.entityType,
      input.entityId,
      next,
      executor,
      now,
    );
    return null;
  }

  if (row) {
    await recomputeEntityTrackedDurationCache(
      workspaceId,
      input.entityType,
      input.entityId,
      executor,
      now,
    );
  }
  return row ?? null;
}

/** Reduce ledger sum to `target` by soft-deleting newest closed entries / shrinking. */
async function trimEntityDurationToTotal(
  workspaceId: string,
  entityType: TimeEntryEntityType,
  entityId: string,
  target: number,
  executor: DbExecutor,
  now: Date,
): Promise<void> {
  const rows = await executor
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.entityType, entityType),
        eq(timeEntries.entityId, entityId),
        isNull(timeEntries.deletedAt),
      ),
    )
    .orderBy(desc(timeEntries.startedAt), desc(timeEntries.id));

  let total = rows.reduce((sum, row) => sum + Math.max(0, row.durationSeconds), 0);
  for (const row of rows) {
    if (total <= target) break;
    if (row.endedAt == null) continue;
    const excess = total - target;
    if (row.durationSeconds <= excess) {
      await executor
        .update(timeEntries)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.id, row.id),
          ),
        );
      total -= row.durationSeconds;
    } else {
      await executor
        .update(timeEntries)
        .set({
          durationSeconds: row.durationSeconds - excess,
          updatedAt: now,
        })
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.id, row.id),
          ),
        );
      total -= excess;
    }
  }
  await recomputeEntityTrackedDurationCache(
    workspaceId,
    entityType,
    entityId,
    executor,
    now,
  );
}

export async function summarizeTimeEntries(
  workspaceId: string,
  query: TimeEntrySummaryQuery,
  executor: DbExecutor = db,
): Promise<{
  groupBy: TimeEntrySummaryQuery["groupBy"];
  totalDurationSeconds: number;
  buckets: Array<{
    key: string;
    label: string | null;
    durationSeconds: number;
    entryCount: number;
  }>;
}> {
  const groupBy = query.groupBy ?? "day";
  const conditions = [
    eq(timeEntries.workspaceId, workspaceId),
    isNull(timeEntries.deletedAt),
  ];
  if (query.entityType) {
    conditions.push(eq(timeEntries.entityType, query.entityType));
  }
  if (query.entityId) {
    conditions.push(eq(timeEntries.entityId, query.entityId));
  }
  if (query.projectId) {
    conditions.push(eq(timeEntries.projectId, query.projectId));
  }
  if (query.actorContactId) {
    conditions.push(eq(timeEntries.actorContactId, query.actorContactId));
  }
  if (query.from) {
    conditions.push(gte(timeEntries.startedAt, new Date(query.from)));
  }
  if (query.to) {
    conditions.push(lte(timeEntries.startedAt, new Date(query.to)));
  }

  const keyExpr =
    groupBy === "day"
      ? sql<string>`to_char((${timeEntries.startedAt} at time zone 'UTC'), 'YYYY-MM-DD')`
      : groupBy === "project"
        ? sql<string>`coalesce(${timeEntries.projectId}, 'none')`
        : groupBy === "actor"
          ? sql<string>`coalesce(${timeEntries.actorContactId}, 'none')`
          : sql<string>`(${timeEntries.entityType} || ':' || ${timeEntries.entityId})`;

  const rows = await executor
    .select({
      key: keyExpr,
      durationSeconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(timeEntries)
    .where(and(...conditions))
    .groupBy(keyExpr)
    .orderBy(asc(keyExpr));

  const buckets = rows.map((row) => ({
    key: String(row.key),
    label: null as string | null,
    durationSeconds: Math.max(0, Math.round(Number(row.durationSeconds ?? 0))),
    entryCount: Math.max(0, Math.round(Number(row.entryCount ?? 0))),
  }));
  const totalDurationSeconds = buckets.reduce(
    (sum, bucket) => sum + bucket.durationSeconds,
    0,
  );

  return { groupBy, totalDurationSeconds, buckets };
}

export type { TimeEntrySource };
