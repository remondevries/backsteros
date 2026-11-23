import { isActiveOpenTimeEntry } from "@backsteros/contracts";
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { taskActivities, tasks, users, projects } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import type { TaskWriteActor } from "../lib/write-actor.js";
import { resolveWriteActorProfile } from "./task-comments.js";
import {
  nextTrackedDurationAfterAutoStop,
  shouldAutoStartTaskTimer,
  shouldAutoStopTaskTimer,
  timerActorFromAssignee,
} from "./task-auto-timer.js";
import {
  RECENT_TASK_TIMER_LIMIT,
  RECENT_TASK_TIMER_MAX_AGE_MS,
  toRecentTaskTimer,
  type RecentTaskTimer,
  type RecentTaskTimerRow,
} from "./task-recent-timers.js";
import * as timeEntryService from "./time-entries/index.js";

export {
  nextTrackedDurationAfterAutoStop,
  shouldAutoStartTaskTimer,
  shouldAutoStopTaskTimer,
  timerActorFromAssignee,
  RECENT_TASK_TIMER_LIMIT,
  RECENT_TASK_TIMER_MAX_AGE_MS,
  toRecentTaskTimer,
};
export type { RecentTaskTimer, RecentTaskTimerRow };

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type TaskActivityType =
  | "created"
  | "status_changed"
  | "assignee_changed"
  | "related_contacts_changed"
  | "related_organizations_changed"
  | "priority_changed"
  | "due_date_changed"
  | "project_changed"
  | "agent_worked"
  | "timer_started"
  | "timer_stopped"
  | "automate_completion_changed"
  | "auto_review_requested"
  | "comment";

/** Property updates coalesce into one row when repeated quickly. */
const COALESCEABLE_ACTIVITY_TYPES = new Set<TaskActivityType>([
  "status_changed",
  "assignee_changed",
  "related_contacts_changed",
  "related_organizations_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
  "automate_completion_changed",
]);

/** System event types (excludes discussion comments). */
export const SYSTEM_ACTIVITY_TYPES = [
  "created",
  "status_changed",
  "assignee_changed",
  "related_contacts_changed",
  "related_organizations_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
  "agent_worked",
  "timer_started",
  "timer_stopped",
  "automate_completion_changed",
  "auto_review_requested",
] as const satisfies readonly TaskActivityType[];

/** Rapid edits of the same property within this window update the prior row. */
export const ACTIVITY_COALESCE_WINDOW_MS = 30_000;

export type { TaskWriteActor } from "../lib/write-actor.js";

export type TaskActivityListRow = typeof taskActivities.$inferSelect & {
  userDisplayName: string | null;
  userEmail: string | null;
  projectId?: string | null;
  taskNumber?: number | null;
  taskTitle?: string | null;
};

function asDataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function activityValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "string" && typeof b === "string") return a === b;
  return false;
}

async function resolveActorProfile(
  workspaceId: string,
  actor: TaskWriteActor | null | undefined,
  executor: DbExecutor,
) {
  return resolveWriteActorProfile(workspaceId, actor, executor);
}

export async function recordTaskActivity(
  workspaceId: string,
  taskId: string,
  type: TaskActivityType,
  data: Record<string, unknown>,
  actor: TaskWriteActor | null | undefined,
  executor: DbExecutor = db,
  id?: string,
) {
  const resolved = await resolveActorProfile(workspaceId, actor, executor);

  if (COALESCEABLE_ACTIVITY_TYPES.has(type)) {
    const since = new Date(Date.now() - ACTIVITY_COALESCE_WINDOW_MS);
    const actorMatch = resolved.contactId
      ? eq(taskActivities.actorContactId, resolved.contactId)
      : resolved.userId
        ? eq(taskActivities.actorUserId, resolved.userId)
        : isNull(taskActivities.actorUserId);
    const [recent] = await executor
      .select()
      .from(taskActivities)
      .where(
        and(
          eq(taskActivities.workspaceId, workspaceId),
          eq(taskActivities.taskId, taskId),
          eq(taskActivities.type, type),
          actorMatch,
          gte(taskActivities.createdAt, since),
        ),
      )
      .orderBy(desc(taskActivities.createdAt))
      .limit(1);

    if (recent) {
      const previous = asDataRecord(recent.data);
      const merged: Record<string, unknown> = {
        ...data,
        from: Object.prototype.hasOwnProperty.call(previous, "from")
          ? previous.from
          : data.from,
        to: data.to,
      };
      if (Object.prototype.hasOwnProperty.call(previous, "fromName")) {
        merged.fromName = previous.fromName;
      }
      if (Object.prototype.hasOwnProperty.call(data, "toName")) {
        merged.toName = data.toName;
      }

      // Edit then revert within the window — drop the noise entirely.
      if (activityValuesEqual(merged.from, merged.to)) {
        await (executor as unknown as Pick<typeof db, "delete">)
          .delete(taskActivities)
          .where(eq(taskActivities.id, recent.id));
        return null;
      }

      const [updated] = await executor
        .update(taskActivities)
        .set({
          data: merged,
          actorEmail: resolved.email ?? recent.actorEmail,
          actorName: resolved.name ?? recent.actorName,
          actorContactId: resolved.contactId ?? recent.actorContactId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(taskActivities.id, recent.id))
        .returning();
      return updated ?? null;
    }
  }

  const [row] = await executor
    .insert(taskActivities)
    .values({
      id: id ?? newId(),
      workspaceId,
      taskId,
      type,
      actorUserId: resolved.userId,
      actorContactId: resolved.contactId,
      actorEmail: resolved.email,
      actorName: resolved.name,
      data,
      updatedAt: new Date(),
    })
    .returning();
  return row ?? null;
}

export async function createClientTaskActivity(
  workspaceId: string,
  taskId: string,
  type: Extract<
    TaskActivityType,
    "agent_worked" | "timer_started" | "timer_stopped"
  >,
  data: Record<string, unknown>,
  actor: TaskWriteActor | null = { userId: null, kind: "agent" },
  executor: DbExecutor = db,
  id?: string,
) {
  const [task] = await executor
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (!task) return null;

  const row = await recordTaskActivity(
    workspaceId,
    taskId,
    type,
    { ...data },
    actor,
    executor,
    id,
  );

  // Dual-write: keep the activity feed while the ledger is source of truth.
  if (row && (type === "timer_started" || type === "timer_stopped")) {
    const profile = await resolveActorProfile(workspaceId, actor, executor);
    const ledgerActor = {
      userId: profile.userId,
      contactId: profile.contactId,
    };
    const ledgerExecutor = executor as unknown as timeEntryService.DbExecutor;
    if (type === "timer_started") {
      await timeEntryService.startOpenTimeEntry(
        workspaceId,
        {
          entityType: "task",
          entityId: taskId,
          actor: ledgerActor,
          startedAt: row.createdAt,
          source: "timer",
          legacyStartActivityId: row.id,
        },
        ledgerExecutor,
      );
    } else {
      const durationSeconds = durationSecondsFromStopData(data);
      await timeEntryService.stopOpenTimeEntry(
        workspaceId,
        {
          entityType: "task",
          entityId: taskId,
          endedAt: row.createdAt,
          durationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
        },
        ledgerExecutor,
      );
    }
  }

  return row;
}

export async function getTaskActivityRow(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<typeof taskActivities.$inferSelect | null> {
  const [row] = await executor
    .select()
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listTaskActivities(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor = db,
): Promise<TaskActivityListRow[] | null> {
  const [task] = await executor
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (!task) return null;

  const rows = await executor
    .select({
      id: taskActivities.id,
      workspaceId: taskActivities.workspaceId,
      taskId: taskActivities.taskId,
      type: taskActivities.type,
      actorUserId: taskActivities.actorUserId,
      actorContactId: taskActivities.actorContactId,
      actorEmail: taskActivities.actorEmail,
      actorName: taskActivities.actorName,
      data: taskActivities.data,
      body: taskActivities.body,
      parentId: taskActivities.parentId,
      resolvedAt: taskActivities.resolvedAt,
      createdAt: taskActivities.createdAt,
      updatedAt: taskActivities.updatedAt,
      deletedAt: taskActivities.deletedAt,
      userDisplayName: users.displayName,
      userEmail: users.email,
    })
    .from(taskActivities)
    .leftJoin(users, eq(taskActivities.actorUserId, users.id))
    .where(
      and(
        eq(taskActivities.taskId, taskId),
        eq(taskActivities.workspaceId, workspaceId),
        // Legacy per-task /activities endpoint: system events only.
        inArray(taskActivities.type, [...SYSTEM_ACTIVITY_TYPES]),
        isNull(taskActivities.deletedAt),
      ),
    )
    .orderBy(asc(taskActivities.createdAt));

  return rows;
}

export type ListActivitiesFilter = {
  taskId?: string;
  projectId?: string;
  types?: string[];
  includeDeleted?: boolean;
  limit?: number;
  cursor?: string | null;
  /**
   * Comment visibility (OS-187). Same rule as GET /comments:
   * `all` → no filter; `client_visible` / `internal` → filter comment rows
   * via `data.visibility` (system events included unless
   * {@link excludeSystemEvents} is set).
   */
  visibility?: "client_visible" | "internal" | "all";
  /**
   * OS-195: portal API keys must not see system activity events (status
   * changes, assignments, timers, etc.) — only client-visible comments.
   * Owner/agent keys leave this unset.
   */
  excludeSystemEvents?: boolean;
};

function encodeActivitiesCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeActivitiesCursor(
  cursor: string | undefined | null,
): { createdAt: Date; id: string } | null {
  if (!cursor?.trim()) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { createdAt?: string; id?: string };
    if (!parsed.createdAt || !parsed.id) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * Unified activity feed for clients (desktop, portal, mobile).
 * Scope with taskId or projectId; dial types to include comments and/or events.
 */
export async function listActivities(
  workspaceId: string,
  filter: ListActivitiesFilter,
  executor: DbExecutor = db,
): Promise<{ rows: TaskActivityListRow[]; nextCursor: string | null } | null> {
  const taskId = filter.taskId?.trim() || null;
  const projectId = filter.projectId?.trim() || null;
  if (!taskId && !projectId) return null;

  if (taskId) {
    const [task] = await executor
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.workspaceId, workspaceId),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    if (!task) return null;
  } else if (projectId) {
    const [project] = await executor
      .select({ id: tasks.projectId })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          eq(tasks.workspaceId, workspaceId),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    // Empty project is still valid — return empty feed rather than 404 when
    // the project exists. Check projects table when no tasks match.
    if (!project) {
      const [exists] = await executor
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.workspaceId, workspaceId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);
      if (!exists) return null;
    }
  }

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const types = (filter.types ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const cursor = decodeActivitiesCursor(filter.cursor);
  const visibility = filter.visibility ?? "all";
  const excludeSystemEvents = filter.excludeSystemEvents === true;

  const conditions = [
    eq(taskActivities.workspaceId, workspaceId),
    ...(taskId ? [eq(taskActivities.taskId, taskId)] : []),
    ...(projectId
      ? [
          eq(tasks.projectId, projectId),
          eq(tasks.workspaceId, workspaceId),
          isNull(tasks.deletedAt),
        ]
      : []),
    ...(types.length > 0 ? [inArray(taskActivities.type, types)] : []),
    ...(filter.includeDeleted ? [] : [isNull(taskActivities.deletedAt)]),
    // Portal (OS-195): only client-visible comments — never system events.
    ...(excludeSystemEvents
      ? [
          eq(taskActivities.type, "comment"),
          sql`coalesce(${taskActivities.data}->>'visibility', 'client_visible') = 'client_visible'`,
        ]
      : // Staff visibility filter: hide internal comment bodies; keep system events.
        visibility === "all"
        ? []
        : [
            or(
              sql`${taskActivities.type} <> 'comment'`,
              sql`coalesce(${taskActivities.data}->>'visibility', 'client_visible') = ${visibility}`,
            )!,
          ]),
  ];

  if (cursor) {
    conditions.push(
      or(
        lt(taskActivities.createdAt, cursor.createdAt),
        and(
          eq(taskActivities.createdAt, cursor.createdAt),
          lt(taskActivities.id, cursor.id),
        ),
      )!,
    );
  }

  const baseQuery = executor
    .select({
      id: taskActivities.id,
      workspaceId: taskActivities.workspaceId,
      taskId: taskActivities.taskId,
      type: taskActivities.type,
      actorUserId: taskActivities.actorUserId,
      actorContactId: taskActivities.actorContactId,
      actorEmail: taskActivities.actorEmail,
      actorName: taskActivities.actorName,
      data: taskActivities.data,
      body: taskActivities.body,
      parentId: taskActivities.parentId,
      resolvedAt: taskActivities.resolvedAt,
      createdAt: taskActivities.createdAt,
      updatedAt: taskActivities.updatedAt,
      deletedAt: taskActivities.deletedAt,
      userDisplayName: users.displayName,
      userEmail: users.email,
      projectId: tasks.projectId,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
    })
    .from(taskActivities)
    .leftJoin(users, eq(taskActivities.actorUserId, users.id))
    .innerJoin(tasks, eq(taskActivities.taskId, tasks.id))
    .where(and(...conditions))
    .orderBy(desc(taskActivities.createdAt), desc(taskActivities.id))
    .limit(limit + 1);

  const rows = await baseQuery;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeActivitiesCursor(last.createdAt, last.id)
      : null;

  return { rows: page, nextCursor };
}

export type OpenRunningTaskTimer = {
  taskId: string;
  startedAt: Date;
  title: string;
  number: number | null;
  status: string | null;
  trackedDurationSeconds: number | null;
  trackedMinutes: number | null;
  projectKey: string | null;
  updatedAt: Date | null;
};

/** Default window for “still running” — ignores abandoned starts without a stop. */
export const OPEN_RUNNING_TIMER_MAX_AGE_MS = 36 * 60 * 60 * 1000;

/**
 * Tasks with an open `time_entries` row (ended_at null), within `maxAgeMs`.
 * Falls back to activity-pair heuristics only when the ledger has no open row
 * for that task yet (pre-backfill). Used by desktop chrome.
 */
export async function listOpenRunningTaskTimers(
  workspaceId: string,
  maxAgeMs: number = OPEN_RUNNING_TIMER_MAX_AGE_MS,
): Promise<OpenRunningTaskTimer[]> {
  const since = new Date(Date.now() - Math.max(0, maxAgeMs));
  const sinceIso = since.toISOString();
  const rows = await db.execute<{
    taskId: string;
    startedAt: Date | string;
    title: string;
    number: number | null;
    status: string | null;
    trackedDurationSeconds: number | null;
    trackedMinutes: number | null;
    projectKey: string | null;
    updatedAt: Date | string | null;
    entryDurationSeconds: number | null;
  }>(sql`
    SELECT
      e.entity_id AS "taskId",
      e.started_at AS "startedAt",
      t.title AS title,
      t.number AS number,
      t.status AS status,
      t.tracked_duration_seconds AS "trackedDurationSeconds",
      t.tracked_minutes AS "trackedMinutes",
      e.updated_at AS "updatedAt",
      e.duration_seconds AS "entryDurationSeconds",
      p.key AS "projectKey"
    FROM time_entries e
    INNER JOIN tasks t
      ON t.id = e.entity_id
      AND t.workspace_id = ${workspaceId}
      AND t.deleted_at IS NULL
    LEFT JOIN projects p
      ON p.id = t.project_id
      AND p.deleted_at IS NULL
    WHERE e.workspace_id = ${workspaceId}
      AND e.entity_type = 'task'
      AND e.ended_at IS NULL
      AND e.deleted_at IS NULL
      AND e.started_at >= ${sinceIso}::timestamptz
    ORDER BY e.started_at DESC
  `);

  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown }).rows;
  const entries = (Array.isArray(list) ? list : []) as Array<{
    taskId: string;
    startedAt: Date | string;
    title: string;
    number: number | null;
    status: string | null;
    trackedDurationSeconds: number | null;
    trackedMinutes: number | null;
    projectKey: string | null;
    updatedAt: Date | string | null;
    entryDurationSeconds: number | null;
  }>;

  return entries.flatMap((row) => {
    const startedAt =
      row.startedAt instanceof Date
        ? row.startedAt
        : new Date(String(row.startedAt));
    const updatedAt =
      row.updatedAt == null
        ? null
        : row.updatedAt instanceof Date
          ? row.updatedAt
          : new Date(String(row.updatedAt));
    const trackedDurationSeconds =
      row.trackedDurationSeconds == null
        ? null
        : Number(row.trackedDurationSeconds);
    const trackedMinutes =
      row.trackedMinutes == null ? null : Number(row.trackedMinutes);
    const entryDurationSeconds =
      row.entryDurationSeconds == null
        ? null
        : Number(row.entryDurationSeconds);
    if (
      !isActiveOpenTimeEntry({
        startedAtMs: startedAt.getTime(),
        durationSeconds: entryDurationSeconds ?? trackedDurationSeconds,
        updatedAtMs:
          updatedAt && !Number.isNaN(updatedAt.getTime())
            ? updatedAt.getTime()
            : null,
      })
    ) {
      return [];
    }
    return [
      {
        taskId: row.taskId,
        startedAt,
        title: row.title,
        number: row.number == null ? null : Number(row.number),
        status: row.status,
        trackedDurationSeconds,
        trackedMinutes,
        projectKey: row.projectKey,
        updatedAt,
      },
    ];
  });
}

/**
 * Distinct tasks with recent time_entries activity, for shared chrome dropdowns.
 * Includes paused sessions; `isRunning` uses open-entry liveness.
 */
export async function listRecentTaskTimers(
  workspaceId: string,
  options?: {
    maxAgeMs?: number;
    limit?: number;
  },
): Promise<RecentTaskTimer[]> {
  const maxAgeMs = Math.max(
    0,
    options?.maxAgeMs ?? RECENT_TASK_TIMER_MAX_AGE_MS,
  );
  const limit = Math.min(
    100,
    Math.max(1, Math.floor(options?.limit ?? RECENT_TASK_TIMER_LIMIT)),
  );
  const since = new Date(Date.now() - maxAgeMs);
  const sinceIso = since.toISOString();
  const rows = await db.execute<{
    taskId: string;
    lastTimerAt: Date | string;
    latestType: string;
    title: string;
    number: number | null;
    status: string | null;
    trackedDurationSeconds: number | null;
    trackedMinutes: number | null;
    projectKey: string | null;
    updatedAt: Date | string | null;
  }>(sql`
    SELECT
      e.entity_id AS "taskId",
      COALESCE(e.ended_at, e.started_at) AS "lastTimerAt",
      CASE WHEN e.ended_at IS NULL THEN 'timer_started' ELSE 'timer_stopped' END AS "latestType",
      t.title AS title,
      t.number AS number,
      t.status AS status,
      t.tracked_duration_seconds AS "trackedDurationSeconds",
      t.tracked_minutes AS "trackedMinutes",
      e.updated_at AS "updatedAt",
      p.key AS "projectKey"
    FROM time_entries e
    INNER JOIN tasks t
      ON t.id = e.entity_id
      AND t.workspace_id = ${workspaceId}
      AND t.deleted_at IS NULL
    LEFT JOIN projects p
      ON p.id = t.project_id
      AND p.deleted_at IS NULL
    WHERE e.workspace_id = ${workspaceId}
      AND e.entity_type = 'task'
      AND e.deleted_at IS NULL
      AND e.started_at >= ${sinceIso}::timestamptz
      AND e.updated_at = (
        SELECT MAX(c.updated_at)
        FROM time_entries c
        WHERE c.entity_id = e.entity_id
          AND c.workspace_id = ${workspaceId}
          AND c.entity_type = 'task'
          AND c.deleted_at IS NULL
      )
    ORDER BY COALESCE(e.ended_at, e.started_at) ASC
    LIMIT ${limit}
  `);

  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown }).rows;
  const entries = (Array.isArray(list) ? list : []) as RecentTaskTimerRow[];
  return entries.map((row) => toRecentTaskTimer(row));
}

export type DeletedTaskTimerSession = {
  taskId: string;
  start: typeof taskActivities.$inferSelect;
  stop: typeof taskActivities.$inferSelect | null;
  removedDurationSeconds: number;
};

type TimerSessionPair = {
  start: typeof taskActivities.$inferSelect;
  stop: typeof taskActivities.$inferSelect | null;
};

async function findTaskTimerSessionPair(
  workspaceId: string,
  taskId: string,
  activityId: string,
  executor: DbExecutor,
): Promise<TimerSessionPair | null> {
  const [target] = await executor
    .select()
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.taskId, taskId),
        eq(taskActivities.id, activityId),
      ),
    )
    .limit(1);
  if (
    !target ||
    (target.type !== "timer_started" && target.type !== "timer_stopped")
  ) {
    return null;
  }

  const timerRows = await executor
    .select()
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.taskId, taskId),
        inArray(taskActivities.type, ["timer_started", "timer_stopped"]),
      ),
    )
    .orderBy(asc(taskActivities.createdAt));

  const pairs: TimerSessionPair[] = [];
  let open: typeof taskActivities.$inferSelect | null = null;
  for (const row of timerRows) {
    if (row.type === "timer_started") {
      if (open) {
        pairs.push({ start: open, stop: null });
      }
      open = row;
      continue;
    }
    if (!open) continue;
    pairs.push({ start: open, stop: row });
    open = null;
  }
  if (open) {
    pairs.push({ start: open, stop: null });
  }

  return (
    pairs.find(
      (entry) =>
        entry.start.id === activityId || entry.stop?.id === activityId,
    ) ?? null
  );
}

/**
 * Delete a timer session identified by either its `timer_started` or
 * `timer_stopped` activity id. Removes the paired rows and subtracts the
 * recorded duration from the task’s tracked total.
 */
export async function deleteTaskTimerSession(
  workspaceId: string,
  taskId: string,
  activityId: string,
  executor: DbExecutor = db,
): Promise<DeletedTaskTimerSession | null> {
  const pair = await findTaskTimerSessionPair(
    workspaceId,
    taskId,
    activityId,
    executor,
  );
  if (!pair) return null;

  const durationFromStop =
    pair.stop?.data &&
    typeof pair.stop.data === "object" &&
    !Array.isArray(pair.stop.data) &&
    typeof (pair.stop.data as { durationSeconds?: unknown }).durationSeconds ===
      "number"
      ? Math.max(
          0,
          Math.round(
            (pair.stop.data as { durationSeconds: number }).durationSeconds,
          ),
        )
      : null;
  const startedMs = pair.start.createdAt.getTime();
  const stoppedMs = pair.stop?.createdAt.getTime() ?? null;
  const computed =
    pair.stop && Number.isFinite(startedMs) && stoppedMs != null
      ? Math.max(0, Math.round((stoppedMs - startedMs) / 1000))
      : 0;
  const removedDurationSeconds = durationFromStop ?? computed;

  const idsToDelete = [pair.start.id, pair.stop?.id].filter(
    (id): id is string => Boolean(id),
  );
  for (const id of idsToDelete) {
    await (executor as unknown as Pick<typeof db, "delete">)
      .delete(taskActivities)
      .where(
        and(
          eq(taskActivities.workspaceId, workspaceId),
          eq(taskActivities.id, id),
        ),
      );
  }

  // Ledger is source of truth — remove the mirrored entry then recompute cache.
  const ledgerExecutor = executor as unknown as timeEntryService.DbExecutor;
  await timeEntryService.deleteTimeEntryByLegacyStartActivity(
    workspaceId,
    pair.start.id,
    ledgerExecutor,
  );
  await timeEntryService.recomputeEntityTrackedDurationCache(
    workspaceId,
    "task",
    taskId,
    ledgerExecutor,
  );

  return {
    taskId,
    start: pair.start,
    stop: pair.stop,
    removedDurationSeconds,
  };
}

export type UpdatedTaskTimerSessionActor = {
  taskId: string;
  start: typeof taskActivities.$inferSelect;
  stop: typeof taskActivities.$inferSelect | null;
};

/**
 * Reassign the contact shown on a timer session (both start and stop rows).
 */
export async function updateTaskTimerSessionActor(
  workspaceId: string,
  taskId: string,
  activityId: string,
  actorContactId: string,
  executor: DbExecutor = db,
): Promise<UpdatedTaskTimerSessionActor | null> {
  const pair = await findTaskTimerSessionPair(
    workspaceId,
    taskId,
    activityId,
    executor,
  );
  if (!pair) return null;

  const profile = await resolveWriteActorProfile(
    workspaceId,
    { userId: null, contactId: actorContactId, kind: "contact" },
    executor,
  );
  if (!profile.contactId) return null;

  const actorFields = {
    actorUserId: profile.userId,
    actorContactId: profile.contactId,
    actorEmail: profile.email,
    actorName: profile.name,
  };

  const [start] = await executor
    .update(taskActivities)
    .set(actorFields)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.id, pair.start.id),
      ),
    )
    .returning();
  if (!start) return null;

  let stop: typeof taskActivities.$inferSelect | null = null;
  if (pair.stop) {
    const [updatedStop] = await executor
      .update(taskActivities)
      .set(actorFields)
      .where(
        and(
          eq(taskActivities.workspaceId, workspaceId),
          eq(taskActivities.id, pair.stop.id),
        ),
      )
      .returning();
    stop = updatedStop ?? null;
  }

  return { taskId, start, stop };
}

function durationSecondsFromStopData(data: unknown): number {
  if (!data || typeof data !== "object" || Array.isArray(data)) return 0;
  const value = (data as { durationSeconds?: unknown }).durationSeconds;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export async function findOpenTaskTimerStart(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor = db,
): Promise<typeof taskActivities.$inferSelect | null> {
  const timerRows = await executor
    .select()
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.taskId, taskId),
        inArray(taskActivities.type, ["timer_started", "timer_stopped"]),
      ),
    )
    .orderBy(asc(taskActivities.createdAt));

  let open: typeof taskActivities.$inferSelect | null = null;
  for (const row of timerRows) {
    if (row.type === "timer_started") {
      open = row;
      continue;
    }
    open = null;
  }
  return open;
}

async function sumStoppedTimerDurationSeconds(
  workspaceId: string,
  taskId: string,
  executor: DbExecutor,
): Promise<number> {
  const stops = await executor
    .select({ data: taskActivities.data })
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.workspaceId, workspaceId),
        eq(taskActivities.taskId, taskId),
        eq(taskActivities.type, "timer_stopped"),
      ),
    );
  let total = 0;
  for (const row of stops) {
    total += durationSecondsFromStopData(row.data);
  }
  return total;
}

/**
 * Start a timer session when status enters `in_progress`, attributed to the
 * assignee contact (not the agent/user who flipped the status).
 */
export async function autoStartTaskTimerOnStatus(
  workspaceId: string,
  taskId: string,
  assigneeId: string | null | undefined,
  executor: DbExecutor = db,
): Promise<typeof taskActivities.$inferSelect | null> {
  const open = await findOpenTaskTimerStart(workspaceId, taskId, executor);
  if (open) return open;
  return createClientTaskActivity(
    workspaceId,
    taskId,
    "timer_started",
    {},
    timerActorFromAssignee(assigneeId),
    executor,
  );
}

/**
 * Pause a running timer when status leaves `in_progress`, attributed to the
 * assignee contact, and bump `tracked_duration_seconds` when needed.
 */
export async function autoStopTaskTimerOnStatus(
  workspaceId: string,
  taskId: string,
  assigneeId: string | null | undefined,
  executor: DbExecutor = db,
  now: Date = new Date(),
): Promise<{
  stop: typeof taskActivities.$inferSelect | null;
  trackedDurationSeconds: number | null;
} | null> {
  const open = await findOpenTaskTimerStart(workspaceId, taskId, executor);
  if (!open) return null;

  const startedMs = open.createdAt.getTime();
  const sessionSeconds =
    Number.isFinite(startedMs) && startedMs > 0
      ? Math.max(0, Math.floor((now.getTime() - startedMs) / 1000))
      : 0;

  const previousStoppedSecondsSum = await sumStoppedTimerDurationSeconds(
    workspaceId,
    taskId,
    executor,
  );

  const stop = await createClientTaskActivity(
    workspaceId,
    taskId,
    "timer_stopped",
    { durationSeconds: sessionSeconds },
    timerActorFromAssignee(assigneeId),
    executor,
  );

  // createClientTaskActivity dual-writes stop + recomputes cache. Prefer the
  // soft-checkpoint-aware merge when the ledger sum is still behind (e.g.
  // client had already PATCHed a higher running total onto the open entry).
  const [task] = await executor
    .select({
      trackedDurationSeconds: tasks.trackedDurationSeconds,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (!task) {
    return { stop, trackedDurationSeconds: null };
  }

  const nextSeconds = nextTrackedDurationAfterAutoStop({
    currentTrackedSeconds: task.trackedDurationSeconds,
    previousStoppedSecondsSum,
    sessionSeconds,
  });
  if (nextSeconds !== (task.trackedDurationSeconds ?? 0)) {
    await timeEntryService.applyEntityTrackedDuration(
      workspaceId,
      {
        entityType: "task",
        entityId: taskId,
        nextDurationSeconds: nextSeconds > 0 ? nextSeconds : 0,
        actor: timerActorFromAssignee(assigneeId),
        now,
      },
      executor as unknown as timeEntryService.DbExecutor,
    );
  }

  const trackedDurationSeconds = nextSeconds > 0 ? nextSeconds : null;
  return { stop, trackedDurationSeconds };
}

export { activityActorName, authorDisplayName } from "./task-comments.js";
