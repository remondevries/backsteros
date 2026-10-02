/**
 * OS-42: peer sync_event apply must not invent a second activity row or bump
 * updated_at past the event's own timestamp.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { and, eq, isNull } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  entityCounters,
  mutationReceipts,
  projects,
  taskActivities,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import { applyPeerSyncEvent } from "../services/core-replication/sync-event-replication.js";
import * as taskProjectService from "../services/tasks-projects.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.CORE_REPLICATION_RECONCILE = "0";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

async function seedWorkspace() {
  const userId = id("user");
  const workspaceId = id("workspace");
  const projectId = id("project");
  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-42 WS",
    slug: id("os42"),
    ownerUserId: userId,
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "O42",
    name: "OS-42 project",
    type: "general",
  });
  return { userId, workspaceId, projectId };
}

async function cleanup(ids: {
  userId: string;
  workspaceId: string;
  projectId: string;
  taskId: string;
}) {
  await db
    .delete(taskActivities)
    .where(eq(taskActivities.taskId, ids.taskId));
  await db
    .delete(mutationReceipts)
    .where(eq(mutationReceipts.workspaceId, ids.workspaceId));
  await db.delete(tasks).where(eq(tasks.id, ids.taskId));
  await db
    .delete(entityCounters)
    .where(eq(entityCounters.workspaceId, ids.workspaceId));
  await db.delete(projects).where(eq(projects.id, ids.projectId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
  await db.delete(users).where(eq(users.id, ids.userId));
}

async function listLiveActivities(taskId: string) {
  return db
    .select({
      id: taskActivities.id,
      type: taskActivities.type,
    })
    .from(taskActivities)
    .where(
      and(eq(taskActivities.taskId, taskId), isNull(taskActivities.deletedAt)),
    );
}

test("OS-42: peer status apply does not invent status_changed or freshen updated_at", async () => {
  const seeded = await seedWorkspace();
  const taskId = id("task");

  try {
    const created = await taskProjectService.createTask(
      seeded.workspaceId,
      {
        projectId: seeded.projectId,
        title: "OS-42 echo",
        status: "ready_to_start",
      },
      taskId,
    );
    assert.ok(created);

    const afterCreate = await listLiveActivities(taskId);
    assert.ok(afterCreate.some((row) => row.type === "created"));
    assert.equal(
      afterCreate.filter((row) => row.type === "status_changed").length,
      0,
    );
    const activityCountAfterCreate = afterCreate.length;

    // Event must be >= local updated_at or peer apply skips as stale (OS-49).
    const eventUpdatedAt = new Date(created.updatedAt.getTime() + 150);
    const applied = await applyPeerSyncEvent(seeded.workspaceId, {
      cursor: 1,
      mutationId: id("mut"),
      deviceId: "peer-test",
      entity: "task",
      entityId: taskId,
      operation: "upsert",
      payload: {
        id: taskId,
        project_id: seeded.projectId,
        title: "OS-42 echo",
        status: "in_progress",
        priority: 0,
        sort_order: 0,
        updated_at: eventUpdatedAt.toISOString(),
      },
      // Peer feed often arrives ~100ms later — must not become the row time.
      createdAt: new Date(eventUpdatedAt.getTime() + 110),
    });
    assert.equal(applied, "applied");

    const afterPeer = await listLiveActivities(taskId);
    assert.equal(
      afterPeer.length,
      activityCountAfterCreate,
      "peer apply must not invent activity rows (they arrive as task_activity)",
    );
    assert.equal(
      afterPeer.filter((row) => row.type === "status_changed").length,
      0,
      "peer apply must not invent status_changed",
    );

    const [row] = await db
      .select({
        status: tasks.status,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    assert.ok(row);
    assert.equal(row.status, "in_progress");
    assert.equal(
      row.updatedAt.toISOString(),
      eventUpdatedAt.toISOString(),
      "peer apply must keep the event updated_at (no freshen)",
    );
  } finally {
    await cleanup({ ...seeded, taskId });
  }
});

test("OS-42: user change then peer echo keeps a single status_changed", async () => {
  const seeded = await seedWorkspace();
  const taskId = id("task");

  try {
    await taskProjectService.createTask(
      seeded.workspaceId,
      {
        projectId: seeded.projectId,
        title: "OS-42 user+echo",
        status: "ready_to_start",
      },
      taskId,
    );

    const updated = await taskProjectService.updateTask(
      seeded.workspaceId,
      taskId,
      { status: "in_review" },
    );
    assert.ok(updated);

    const afterUser = await listLiveActivities(taskId);
    assert.equal(
      afterUser.filter((row) => row.type === "status_changed").length,
      1,
    );
    const activityCountAfterUser = afterUser.length;
    const eventUpdatedAt = new Date(updated.updatedAt.getTime());

    // Rewind local status so the peer payload is a real transition again
    // (mirrors receiving the echo before local already matched).
    await db
      .update(tasks)
      .set({ status: "ready_to_start", updatedAt: eventUpdatedAt })
      .where(eq(tasks.id, taskId));

    const applied = await applyPeerSyncEvent(seeded.workspaceId, {
      cursor: 2,
      mutationId: id("mut"),
      deviceId: "peer-test",
      entity: "task",
      entityId: taskId,
      operation: "upsert",
      payload: {
        id: taskId,
        project_id: seeded.projectId,
        title: "OS-42 user+echo",
        status: "in_review",
        priority: 0,
        sort_order: 0,
        updated_at: eventUpdatedAt.toISOString(),
      },
      createdAt: new Date(eventUpdatedAt.getTime() + 110),
    });
    assert.equal(applied, "applied");

    const afterPeer = await listLiveActivities(taskId);
    assert.equal(afterPeer.length, activityCountAfterUser);
    assert.equal(
      afterPeer.filter((row) => row.type === "status_changed").length,
      1,
    );

    const [row] = await db
      .select({ updatedAt: tasks.updatedAt, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    assert.ok(row);
    assert.equal(row.status, "in_review");
    assert.equal(row.updatedAt.toISOString(), eventUpdatedAt.toISOString());
  } finally {
    await cleanup({ ...seeded, taskId });
  }
});
