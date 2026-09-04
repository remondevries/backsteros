import { and, asc, eq, isNull, lte } from "drizzle-orm";

import type {
  CreateRecurringTaskInput,
  RecurringTask,
  UpdateRecurringTaskInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  projects,
  recurringTasks,
  type DbRecurringTask,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  assertValidCronExpression,
  getNextCronDate,
} from "../lib/cron.js";
import { appendOpsLog } from "../lib/ops-log-buffer.js";
import { toIso } from "../lib/mappers.js";
import * as taskProjectService from "./tasks-projects.js";

/** Local-core must not spawn — cloud leader owns due ticks to avoid duplicate tasks. */
function shouldRunRecurringTaskSpawner(): boolean {
  return process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() !== "local";
}

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

function toRecurringTask(row: DbRecurringTask): RecurringTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    projectId: row.projectId,
    inbox: row.inbox,
    cronExpression: row.cronExpression,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: toIso(row.lastRunAt),
    lastTaskId: row.lastTaskId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertProjectInWorkspace(
  workspaceId: string,
  projectId: string | null | undefined,
  executor: DbExecutor = db,
) {
  if (!projectId) return;
  const [row] = await executor
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error("PROJECT_NOT_FOUND");
  }
}

export async function listRecurringTasks(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<RecurringTask[]> {
  const rows = await executor
    .select()
    .from(recurringTasks)
    .where(
      and(
        eq(recurringTasks.workspaceId, workspaceId),
        isNull(recurringTasks.deletedAt),
      ),
    )
    .orderBy(asc(recurringTasks.nextRunAt));
  return rows.map(toRecurringTask);
}

export async function getRecurringTaskById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<DbRecurringTask | null> {
  const [row] = await executor
    .select()
    .from(recurringTasks)
    .where(
      and(
        eq(recurringTasks.workspaceId, workspaceId),
        eq(recurringTasks.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createRecurringTask(
  workspaceId: string,
  input: CreateRecurringTaskInput,
  id: string = newId(),
  executor: DbExecutor = db,
): Promise<RecurringTask> {
  const cronExpression = assertValidCronExpression(input.cronExpression);
  await assertProjectInWorkspace(workspaceId, input.projectId, executor);
  const now = new Date();
  const nextRunAt = getNextCronDate(cronExpression, now);
  const projectId = input.projectId ?? null;
  const inbox = input.inbox ?? !projectId;

  const [row] = await executor
    .insert(recurringTasks)
    .values({
      id,
      workspaceId,
      title: input.title,
      description: input.description ?? null,
      projectId,
      inbox,
      cronExpression,
      enabled: input.enabled ?? true,
      nextRunAt,
    })
    .returning();

  return toRecurringTask(row!);
}

export async function updateRecurringTask(
  workspaceId: string,
  id: string,
  input: UpdateRecurringTaskInput,
  executor: DbExecutor = db,
): Promise<RecurringTask | null> {
  const [existing] = await executor
    .select()
    .from(recurringTasks)
    .where(
      and(
        eq(recurringTasks.workspaceId, workspaceId),
        eq(recurringTasks.id, id),
        isNull(recurringTasks.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) return null;

  if (input.projectId !== undefined) {
    await assertProjectInWorkspace(workspaceId, input.projectId, executor);
  }

  const cronExpression =
    input.cronExpression !== undefined
      ? assertValidCronExpression(input.cronExpression)
      : existing.cronExpression;

  const projectId =
    input.projectId !== undefined ? input.projectId : existing.projectId;
  const inbox =
    input.inbox !== undefined
      ? input.inbox
      : projectId
        ? false
        : existing.inbox;

  const cronChanged =
    input.cronExpression !== undefined &&
    cronExpression !== existing.cronExpression;
  const enabledNow = input.enabled ?? existing.enabled;
  const nextRunAt =
    cronChanged || (enabledNow && !existing.enabled)
      ? getNextCronDate(cronExpression, new Date())
      : existing.nextRunAt;

  const [row] = await executor
    .update(recurringTasks)
    .set({
      title: input.title ?? existing.title,
      description:
        input.description !== undefined
          ? input.description
          : existing.description,
      projectId,
      inbox,
      cronExpression,
      enabled: enabledNow,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(recurringTasks.id, id))
    .returning();

  return row ? toRecurringTask(row) : null;
}

/** Apply runner/sync fields that are not part of the public update schema. */
export async function applyRecurringTaskSyncState(
  workspaceId: string,
  id: string,
  input: {
    nextRunAt?: Date | null;
    lastRunAt?: Date | null;
    lastTaskId?: string | null;
  },
  executor: DbExecutor = db,
): Promise<DbRecurringTask | null> {
  const existing = await getRecurringTaskById(workspaceId, id, executor);
  if (!existing || existing.deletedAt) return null;
  const patch: {
    updatedAt: Date;
    nextRunAt?: Date;
    lastRunAt?: Date | null;
    lastTaskId?: string | null;
  } = { updatedAt: new Date() };
  if (input.nextRunAt !== undefined && input.nextRunAt !== null) {
    patch.nextRunAt = input.nextRunAt;
  }
  if (input.lastRunAt !== undefined) {
    patch.lastRunAt = input.lastRunAt;
  }
  if (input.lastTaskId !== undefined) {
    patch.lastTaskId = input.lastTaskId;
  }
  const [row] = await executor
    .update(recurringTasks)
    .set(patch)
    .where(
      and(
        eq(recurringTasks.workspaceId, workspaceId),
        eq(recurringTasks.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteRecurringTask(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<DbRecurringTask | null> {
  const [row] = await executor
    .update(recurringTasks)
    .set({ deletedAt: new Date(), enabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(recurringTasks.workspaceId, workspaceId),
        eq(recurringTasks.id, id),
        isNull(recurringTasks.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/** Claim due templates and spawn tasks. Safe to call on overlapping ticks. */
export async function runDueRecurringTasks(now = new Date()): Promise<number> {
  if (!shouldRunRecurringTaskSpawner()) {
    return 0;
  }

  const { recordRecurringTaskRestSyncEvent, recordTaskRestSyncEvent } =
    await import("./sync.js");

  const due = await db
    .select()
    .from(recurringTasks)
    .where(
      and(
        eq(recurringTasks.enabled, true),
        isNull(recurringTasks.deletedAt),
        lte(recurringTasks.nextRunAt, now),
      ),
    )
    .orderBy(asc(recurringTasks.nextRunAt))
    .limit(50);

  let spawned = 0;
  for (const row of due) {
    try {
      const nextRunAt = getNextCronDate(row.cronExpression, now);
      const [claimed] = await db
        .update(recurringTasks)
        .set({
          nextRunAt,
          lastRunAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(recurringTasks.id, row.id),
            eq(recurringTasks.enabled, true),
            isNull(recurringTasks.deletedAt),
            lte(recurringTasks.nextRunAt, now),
          ),
        )
        .returning();
      if (!claimed) continue;

      const task = await taskProjectService.createTask(
        row.workspaceId,
        {
          title: row.title,
          description: row.description ?? undefined,
          projectId: row.projectId,
          inbox: row.inbox,
        },
        newId(),
        undefined,
        { userId: null, kind: "agent" },
      );

      if (task) {
        const [updated] = await db
          .update(recurringTasks)
          .set({ lastTaskId: task.id, updatedAt: new Date() })
          .where(eq(recurringTasks.id, row.id))
          .returning();
        await recordTaskRestSyncEvent(row.workspaceId, task, "upsert");
        if (updated) {
          await recordRecurringTaskRestSyncEvent(
            row.workspaceId,
            updated,
            "upsert",
          );
        }
        spawned += 1;
        appendOpsLog(
          "info",
          `recurring task spawned`,
          `${row.id} → ${task.id}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendOpsLog("error", `recurring task failed: ${row.id}`, message);
      console.error("recurring task run failed", row.id, error);
    }
  }
  return spawned;
}

let runnerTimer: ReturnType<typeof setInterval> | null = null;

export function startRecurringTaskRunner(intervalMs = 60_000): void {
  if (runnerTimer) return;
  if (!shouldRunRecurringTaskSpawner()) {
    appendOpsLog(
      "info",
      "recurring task runner skipped (local-core; cloud leader spawns)",
    );
    return;
  }
  const tick = () => {
    void runDueRecurringTasks().catch((error) => {
      console.error("recurring task runner tick failed", error);
      appendOpsLog(
        "error",
        "recurring task runner tick failed",
        error instanceof Error ? error.message : String(error),
      );
    });
  };
  tick();
  runnerTimer = setInterval(tick, intervalMs);
  appendOpsLog("info", "recurring task runner started");
}

export function stopRecurringTaskRunner(): void {
  if (runnerTimer) {
    clearInterval(runnerTimer);
    runnerTimer = null;
  }
}

export { toRecurringTask };
