import { isActiveOpenRunningTimer } from "@backsteros/contracts";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import {
  documents,
  meetings,
  taskActivities,
  tasks,
  timeEntries,
} from "../../db/schema.js";
import { newId } from "../../lib/crypto.js";
import { recomputeEntityTrackedDurationCache } from "./entity-cache.js";
import type { DbExecutor, TimeEntryEntityType } from "./types.js";

function durationSecondsFromStopData(data: unknown): number {
  if (!data || typeof data !== "object" || Array.isArray(data)) return 0;
  const value = (data as { durationSeconds?: unknown }).durationSeconds;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

type TimerPair = {
  start: typeof taskActivities.$inferSelect;
  stop: typeof taskActivities.$inferSelect | null;
};

function pairTimerActivities(
  rows: Array<typeof taskActivities.$inferSelect>,
): TimerPair[] {
  const pairs: TimerPair[] = [];
  let open: typeof taskActivities.$inferSelect | null = null;
  for (const row of rows) {
    if (row.type === "timer_started") {
      if (open) pairs.push({ start: open, stop: null });
      open = row;
      continue;
    }
    if (row.type === "timer_stopped") {
      if (!open) continue;
      pairs.push({ start: open, stop: row });
      open = null;
    }
  }
  if (open) pairs.push({ start: open, stop: null });
  return pairs;
}

async function migrateTaskTimers(
  workspaceId: string,
  executor: DbExecutor,
  now: Date,
): Promise<{ sessions: number; open: number; adjustments: number }> {
  const activityRows = await executor
    .select()
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        inArray(taskActivities.type, ["timer_started", "timer_stopped"]),
      ),
    )
    .orderBy(asc(taskActivities.taskId), asc(taskActivities.createdAt));

  const byTask = new Map<string, Array<typeof taskActivities.$inferSelect>>();
  for (const row of activityRows) {
    const list = byTask.get(row.taskId) ?? [];
    list.push(row);
    byTask.set(row.taskId, list);
  }

  let sessions = 0;
  let open = 0;
  let adjustments = 0;

  for (const [taskId, rows] of byTask) {
    const [task] = await executor
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        relatedOrganizationIds: tasks.relatedOrganizationIds,
        trackedDurationSeconds: tasks.trackedDurationSeconds,
        trackedMinutes: tasks.trackedMinutes,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.id, taskId),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    if (!task) continue;

    const related = Array.isArray(task.relatedOrganizationIds)
      ? task.relatedOrganizationIds
      : [];
    const organizationId = related[0] ?? null;
    let migratedSum = 0;

    for (const pair of pairTimerActivities(rows)) {
      const [existing] = await executor
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.legacyStartActivityId, pair.start.id),
          ),
        )
        .limit(1);
      if (existing) {
        continue;
      }

      if (pair.stop) {
        const fromData = durationSecondsFromStopData(pair.stop.data);
        const wall = Math.max(
          0,
          Math.floor(
            (pair.stop.createdAt.getTime() - pair.start.createdAt.getTime()) /
              1000,
          ),
        );
        const durationSeconds = fromData > 0 ? fromData : wall;
        if (durationSeconds <= 0) continue;
        await executor.insert(timeEntries).values({
          id: newId(),
          workspaceId,
          entityType: "task",
          entityId: taskId,
          actorUserId: pair.start.actorUserId,
          actorContactId: pair.start.actorContactId,
          startedAt: pair.start.createdAt,
          endedAt: pair.stop.createdAt,
          durationSeconds,
          source: "migration",
          note: null,
          projectId: task.projectId,
          organizationId,
          legacyStartActivityId: pair.start.id,
          createdAt: now,
          updatedAt: now,
        });
        migratedSum += durationSeconds;
        sessions += 1;
        continue;
      }

      // Unpaired start
      const live = isActiveOpenRunningTimer({
        startedAtMs: pair.start.createdAt.getTime(),
        trackedDurationSeconds: task.trackedDurationSeconds,
        trackedMinutes: task.trackedMinutes,
        updatedAtMs: task.updatedAt?.getTime() ?? null,
        nowMs: now.getTime(),
      });
      const wall = Math.max(
        0,
        Math.floor((now.getTime() - pair.start.createdAt.getTime()) / 1000),
      );
      if (live) {
        // Open entry — duration is residual after closed sessions for this task
        // will be fixed after all closed are inserted; use wall for now.
        await executor.insert(timeEntries).values({
          id: newId(),
          workspaceId,
          entityType: "task",
          entityId: taskId,
          actorUserId: pair.start.actorUserId,
          actorContactId: pair.start.actorContactId,
          startedAt: pair.start.createdAt,
          endedAt: null,
          durationSeconds: wall,
          source: "migration",
          note: null,
          projectId: task.projectId,
          organizationId,
          legacyStartActivityId: pair.start.id,
          createdAt: now,
          updatedAt: task.updatedAt ?? now,
        });
        open += 1;
      } else if (wall > 0) {
        await executor.insert(timeEntries).values({
          id: newId(),
          workspaceId,
          entityType: "task",
          entityId: taskId,
          actorUserId: pair.start.actorUserId,
          actorContactId: pair.start.actorContactId,
          startedAt: pair.start.createdAt,
          endedAt: new Date(pair.start.createdAt.getTime() + wall * 1000),
          durationSeconds: wall,
          source: "migration",
          note: "abandoned-open",
          projectId: task.projectId,
          organizationId,
          legacyStartActivityId: pair.start.id,
          createdAt: now,
          updatedAt: now,
        });
        migratedSum += wall;
        sessions += 1;
      }
    }

    // Residual scalar adjustment (closed+open sum vs task scalar).
    const [sumRow] = await executor
      .select({
        total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)`,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.entityType, "task"),
          eq(timeEntries.entityId, taskId),
          isNull(timeEntries.deletedAt),
        ),
      );
    const ledgerSum = Math.max(0, Math.round(Number(sumRow?.total ?? 0)));
    const scalar = Math.max(0, Math.round(task.trackedDurationSeconds ?? 0));
    if (scalar > ledgerSum) {
      const delta = scalar - ledgerSum;
      const marker = `migration-adjustment:${taskId}`;
      const [existingAdj] = await executor
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.entityType, "task"),
            eq(timeEntries.entityId, taskId),
            eq(timeEntries.note, marker),
          ),
        )
        .limit(1);
      if (!existingAdj) {
        await executor.insert(timeEntries).values({
          id: newId(),
          workspaceId,
          entityType: "task",
          entityId: taskId,
          actorUserId: null,
          actorContactId: null,
          startedAt: now,
          endedAt: now,
          durationSeconds: delta,
          source: "adjustment",
          note: marker,
          projectId: task.projectId,
          organizationId,
          createdAt: now,
          updatedAt: now,
        });
        adjustments += 1;
      }
    }

    await recomputeEntityTrackedDurationCache(
      workspaceId,
      "task",
      taskId,
      executor,
      now,
    );
    void migratedSum;
  }

  return { sessions, open, adjustments };
}

async function migrateScalarResiduals(
  workspaceId: string,
  entityType: "meeting" | "document",
  executor: DbExecutor,
  now: Date,
): Promise<number> {
  let adjustments = 0;
  if (entityType === "meeting") {
    const rows = await executor
      .select({
        id: meetings.id,
        projectId: meetings.projectId,
        organizationId: meetings.organizationId,
        trackedDurationSeconds: meetings.trackedDurationSeconds,
      })
      .from(meetings)
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          isNull(meetings.deletedAt),
          sql`coalesce(${meetings.trackedDurationSeconds}, 0) > 0`,
        ),
      );
    for (const row of rows) {
      adjustments += await insertResidualIfNeeded(
        workspaceId,
        entityType,
        row.id,
        row.trackedDurationSeconds ?? 0,
        row.projectId,
        row.organizationId,
        executor,
        now,
      );
    }
  } else {
    const rows = await executor
      .select({
        id: documents.id,
        projectId: documents.projectId,
        trackedDurationSeconds: documents.trackedDurationSeconds,
      })
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          isNull(documents.deletedAt),
          sql`coalesce(${documents.trackedDurationSeconds}, 0) > 0`,
        ),
      );
    for (const row of rows) {
      adjustments += await insertResidualIfNeeded(
        workspaceId,
        entityType,
        row.id,
        row.trackedDurationSeconds ?? 0,
        row.projectId,
        null,
        executor,
        now,
      );
    }
  }
  return adjustments;
}

async function insertResidualIfNeeded(
  workspaceId: string,
  entityType: TimeEntryEntityType,
  entityId: string,
  scalarSeconds: number,
  projectId: string | null,
  organizationId: string | null,
  executor: DbExecutor,
  now: Date,
): Promise<number> {
  const [sumRow] = await executor
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
      ),
    );
  const ledgerSum = Math.max(0, Math.round(Number(sumRow?.total ?? 0)));
  const scalar = Math.max(0, Math.round(scalarSeconds));
  if (scalar <= ledgerSum) return 0;

  const marker = `migration-adjustment:${entityId}`;
  const [existingAdj] = await executor
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.entityType, entityType),
        eq(timeEntries.entityId, entityId),
        eq(timeEntries.note, marker),
      ),
    )
    .limit(1);
  if (existingAdj) return 0;

  await executor.insert(timeEntries).values({
    id: newId(),
    workspaceId,
    entityType,
    entityId,
    actorUserId: null,
    actorContactId: null,
    startedAt: now,
    endedAt: now,
    durationSeconds: scalar - ledgerSum,
    source: "adjustment",
    note: marker,
    projectId,
    organizationId,
    createdAt: now,
    updatedAt: now,
  });
  await recomputeEntityTrackedDurationCache(
    workspaceId,
    entityType,
    entityId,
    executor,
    now,
  );
  return 1;
}

export type MigrateLegacyTimeResult = {
  taskSessions: number;
  openTimers: number;
  taskAdjustments: number;
  meetingAdjustments: number;
  documentAdjustments: number;
};

/**
 * Idempotent backfill: timer activity pairs → time_entries, plus residual
 * scalar adjustments for tasks / meetings / documents.
 */
export async function migrateLegacyTrackedTimeToLedger(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<MigrateLegacyTimeResult> {
  const now = new Date();
  const taskResult = await migrateTaskTimers(workspaceId, executor, now);
  const meetingAdjustments = await migrateScalarResiduals(
    workspaceId,
    "meeting",
    executor,
    now,
  );
  const documentAdjustments = await migrateScalarResiduals(
    workspaceId,
    "document",
    executor,
    now,
  );
  return {
    taskSessions: taskResult.sessions,
    openTimers: taskResult.open,
    taskAdjustments: taskResult.adjustments,
    meetingAdjustments,
    documentAdjustments,
  };
}

/** Run backfill for every workspace that has tasks or tracked scalars. */
export async function migrateAllWorkspacesLegacyTrackedTime(
  executor: DbExecutor = db,
): Promise<Array<{ workspaceId: string } & MigrateLegacyTimeResult>> {
  const workspaceRows = await executor.execute<{ id: string }>(sql`
    SELECT id FROM workspaces ORDER BY id
  `);
  const list = Array.isArray(workspaceRows)
    ? workspaceRows
    : ((workspaceRows as { rows?: { id: string }[] }).rows ?? []);
  const results: Array<{ workspaceId: string } & MigrateLegacyTimeResult> = [];
  for (const row of list) {
    const workspaceId = row.id;
    const result = await migrateLegacyTrackedTimeToLedger(workspaceId, executor);
    results.push({ workspaceId, ...result });
  }
  return results;
}
