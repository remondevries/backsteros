import { and, eq, gt, isNull, lt } from "drizzle-orm";

import type { TaskAgentPresence } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { taskAgentPresence, tasks } from "../db/schema.js";
import { publishAgentPresence } from "../lib/agent-presence-events.js";
import {
  isTaskAgentPresenceLive,
  TASK_AGENT_PRESENCE_TTL_MS,
} from "./task-agent-presence-ttl.js";

export { isTaskAgentPresenceLive, TASK_AGENT_PRESENCE_TTL_MS } from "./task-agent-presence-ttl.js";

function toPresence(row: typeof taskAgentPresence.$inferSelect): TaskAgentPresence {
  return {
    taskId: row.taskId,
    source: row.source,
    sessionId: row.sessionId ?? null,
    startedAt: row.startedAt.toISOString(),
    lastHeartbeatAt: row.lastHeartbeatAt.toISOString(),
  };
}

function publishBecameLive(workspaceId: string, taskId: string): void {
  publishAgentPresence({ workspaceId, taskId, live: true });
}

function publishCleared(workspaceId: string, taskId: string): void {
  publishAgentPresence({ workspaceId, taskId, live: false });
}

export async function upsertTaskAgentPresence(
  workspaceId: string,
  taskId: string,
  input: {
    readonly source?: string;
    readonly sessionId?: string | null;
  },
): Promise<TaskAgentPresence | null> {
  const taskRows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, taskId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (!taskRows[0]) return null;

  const now = new Date();
  const source = input.source?.trim() || "unknown";
  const sessionId =
    input.sessionId === undefined
      ? undefined
      : input.sessionId === null
        ? null
        : input.sessionId.trim() || null;

  const existing = await db
    .select()
    .from(taskAgentPresence)
    .where(
      and(
        eq(taskAgentPresence.workspaceId, workspaceId),
        eq(taskAgentPresence.taskId, taskId),
      ),
    )
    .limit(1);
  const wasLive = existing[0]
    ? isTaskAgentPresenceLive(existing[0].lastHeartbeatAt, now)
    : false;

  // Single INSERT … ON CONFLICT so concurrent T3/desktop heartbeats cannot
  // race into a unique-violation 500 on task_id PK.
  const [row] = await db
    .insert(taskAgentPresence)
    .values({
      taskId,
      workspaceId,
      source,
      sessionId: sessionId ?? null,
      startedAt: now,
      lastHeartbeatAt: now,
    })
    .onConflictDoUpdate({
      target: taskAgentPresence.taskId,
      set: {
        source,
        lastHeartbeatAt: now,
        ...(sessionId !== undefined ? { sessionId } : {}),
      },
    })
    .returning();
  if (!row) return null;

  // Heartbeats of already-live rows stay quiet; first insert / resume-from-stale fans out.
  if (!wasLive) publishBecameLive(workspaceId, taskId);
  return toPresence(row);
}

export async function clearTaskAgentPresence(
  workspaceId: string,
  taskId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(taskAgentPresence)
    .where(
      and(
        eq(taskAgentPresence.workspaceId, workspaceId),
        eq(taskAgentPresence.taskId, taskId),
      ),
    )
    .returning({ taskId: taskAgentPresence.taskId });
  if (deleted.length === 0) return false;
  publishCleared(workspaceId, taskId);
  return true;
}

export async function listLiveTaskAgentPresence(
  workspaceId: string,
  options?: {
    readonly projectId?: string;
    readonly now?: Date;
    readonly ttlMs?: number;
  },
): Promise<TaskAgentPresence[]> {
  const now = options?.now ?? new Date();
  const ttlMs = options?.ttlMs ?? TASK_AGENT_PRESENCE_TTL_MS;
  const cutoff = new Date(now.getTime() - ttlMs);

  // Drop clearly stale rows opportunistically so the table stays small.
  const stale = await db
    .delete(taskAgentPresence)
    .where(
      and(
        eq(taskAgentPresence.workspaceId, workspaceId),
        lt(taskAgentPresence.lastHeartbeatAt, cutoff),
      ),
    )
    .returning({ taskId: taskAgentPresence.taskId });
  for (const row of stale) {
    publishCleared(workspaceId, row.taskId);
  }

  if (options?.projectId) {
    const rows = await db
      .select({
        taskId: taskAgentPresence.taskId,
        workspaceId: taskAgentPresence.workspaceId,
        source: taskAgentPresence.source,
        sessionId: taskAgentPresence.sessionId,
        startedAt: taskAgentPresence.startedAt,
        lastHeartbeatAt: taskAgentPresence.lastHeartbeatAt,
      })
      .from(taskAgentPresence)
      .innerJoin(tasks, eq(tasks.id, taskAgentPresence.taskId))
      .where(
        and(
          eq(taskAgentPresence.workspaceId, workspaceId),
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.projectId, options.projectId),
          isNull(tasks.deletedAt),
          gt(taskAgentPresence.lastHeartbeatAt, cutoff),
        ),
      );
    return rows.map(toPresence);
  }

  const rows = await db
    .select()
    .from(taskAgentPresence)
    .where(
      and(
        eq(taskAgentPresence.workspaceId, workspaceId),
        gt(taskAgentPresence.lastHeartbeatAt, cutoff),
      ),
    );
  return rows.map(toPresence);
}
