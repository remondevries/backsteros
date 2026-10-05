/**
 * OS-70: task-number collisions renumber instead of soft-deleting or dead-lettering.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  entityCounters,
  projects,
  replicationDeadLetters,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
import { applyRemoteChanges } from "../services/core-replication/apply.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.CORE_REPLICATION_RECONCILE = "0";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

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
    name: "Task number WS",
    slug: id("tn"),
    ownerUserId: userId,
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "TN",
    name: "Task number project",
    type: "general",
  });
  return { userId, workspaceId, projectId };
}

async function cleanup(ids: {
  userId: string;
  workspaceId: string;
  projectId: string;
  taskIds: string[];
  endClient?: boolean;
}) {
  for (const taskId of ids.taskIds) {
    await db
      .delete(replicationDeadLetters)
      .where(eq(replicationDeadLetters.rowId, taskId));
    await db.delete(tasks).where(eq(tasks.id, taskId));
  }
  await db
    .delete(entityCounters)
    .where(eq(entityCounters.workspaceId, ids.workspaceId));
  await db.delete(projects).where(eq(projects.id, ids.projectId));
  await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
  await db.delete(users).where(eq(users.id, ids.userId));
  if (ids.endClient) {
    await sqlClient.end();
  }
}

function taskRow(args: {
  id: string;
  workspaceId: string;
  projectId: string;
  number: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}) {
  return {
    id: args.id,
    workspace_id: args.workspaceId,
    project_id: args.projectId,
    contact_id: null,
    assignee_id: null,
    related_contact_ids: [],
    related_organization_ids: [],
    linked_email_ids: [],
    label_ids: [],
    number: args.number,
    title: args.title,
    description: null,
    status: "canceled",
    priority: 0,
    sort_order: 0,
    due_date: null,
    due_end_date: null,
    triaged_at: null,
    inbox: false,
    support: false,
    notification: false,
    links: [],
    agent_chat_id: null,
    linked_commit_shas: [],
    habit_id: null,
    legacy_source: null,
    completed_at: null,
    agent_created_at: null,
    agent_inbox_approved_at: null,
    tracked_minutes: null,
    tracked_duration_seconds: null,
    created_at: args.createdAt,
    updated_at: args.updatedAt,
    deleted_at: args.deletedAt ?? null,
  };
}

test("task number collision with live twin renumbers; neither soft-deleted", async (context) => {
  const { userId, workspaceId, projectId } = await seedWorkspace();
  const earlierId = id("task");
  const laterId = id("task");
  const earlierCreated = "2026-08-28T10:00:00.000Z";
  const laterCreated = "2026-08-31T12:00:00.000Z";
  const laterUpdated = "2026-08-31T12:05:00.000Z";

  context.after(async () => {
    await cleanup({
      userId,
      workspaceId,
      projectId,
      taskIds: [earlierId, laterId],
    });
  });

  // Local already has the later-created task at number 189 (live).
  await db.insert(tasks).values({
    id: laterId,
    workspaceId,
    projectId,
    number: 189,
    title: "Cloud habit occurrence",
    status: "canceled",
    createdAt: new Date(laterCreated),
    updatedAt: new Date(laterUpdated),
  });

  const result = await applyRemoteChanges(
    "tasks",
    [
      {
        table: "tasks",
        row: taskRow({
          id: earlierId,
          workspaceId,
          projectId,
          number: 189,
          title: "Local habit occurrence",
          createdAt: earlierCreated,
          updatedAt: earlierCreated,
        }),
      },
    ],
    { direction: "pull" },
  );

  assert.equal(result.failed.length, 0, "must not dead-letter");
  assert.equal(result.applied, 1);

  const [earlier] = await db.select().from(tasks).where(eq(tasks.id, earlierId));
  const [later] = await db.select().from(tasks).where(eq(tasks.id, laterId));
  assert.ok(earlier);
  assert.ok(later);
  assert.equal(earlier.deletedAt, null);
  assert.equal(later.deletedAt, null);
  assert.equal(earlier.number, 189, "earlier-created keeps the number");
  assert.ok(later.number > 189, "later-created is renumbered");
  assert.notEqual(earlier.number, later.number);
});

test("task number collision with soft-deleted twin renumbers instead of dead-lettering", async (context) => {
  const { userId, workspaceId, projectId } = await seedWorkspace();
  const earlierId = id("task");
  const laterId = id("task");
  const earlierCreated = "2026-08-28T10:00:00.000Z";
  const laterCreated = "2026-08-31T12:00:00.000Z";
  const deletedAt = "2026-08-30T09:00:00.000Z";

  context.after(async () => {
    await cleanup({
      userId,
      workspaceId,
      projectId,
      taskIds: [earlierId, laterId],
    });
  });

  // Soft-deleted local twin still occupies the unique index (not partial on deleted_at).
  await db.insert(tasks).values({
    id: laterId,
    workspaceId,
    projectId,
    number: 23,
    title: "Soft-deleted cloud occurrence",
    status: "canceled",
    createdAt: new Date(laterCreated),
    updatedAt: new Date(deletedAt),
    deletedAt: new Date(deletedAt),
  });

  const result = await applyRemoteChanges(
    "tasks",
    [
      {
        table: "tasks",
        row: taskRow({
          id: earlierId,
          workspaceId,
          projectId,
          number: 23,
          title: "Soft-deleted local occurrence",
          createdAt: earlierCreated,
          updatedAt: deletedAt,
          deletedAt,
        }),
      },
    ],
    { direction: "pull" },
  );

  assert.equal(result.failed.length, 0, "must not dead-letter when twin is soft-deleted");
  assert.equal(result.applied, 1);

  const [earlier] = await db.select().from(tasks).where(eq(tasks.id, earlierId));
  const [later] = await db.select().from(tasks).where(eq(tasks.id, laterId));
  assert.ok(earlier);
  assert.ok(later);
  assert.ok(earlier.deletedAt, "incoming soft-delete preserved");
  assert.ok(later.deletedAt, "local soft-delete preserved");
  assert.equal(earlier.number, 23);
  assert.ok(later.number > 23);
});

test("when incoming is later-created, incoming is renumbered and local stays put", async (context) => {
  const { userId, workspaceId, projectId } = await seedWorkspace();
  const earlierId = id("task");
  const laterId = id("task");
  const earlierCreated = "2026-08-28T10:00:00.000Z";
  const laterCreated = "2026-08-31T12:00:00.000Z";

  context.after(async () => {
    await cleanup({
      userId,
      workspaceId,
      projectId,
      taskIds: [earlierId, laterId],
      endClient: true,
    });
  });

  await db.insert(tasks).values({
    id: earlierId,
    workspaceId,
    projectId,
    number: 190,
    title: "Earlier local task",
    status: "ready_to_start",
    createdAt: new Date(earlierCreated),
    updatedAt: new Date(earlierCreated),
  });

  const result = await applyRemoteChanges(
    "tasks",
    [
      {
        table: "tasks",
        row: taskRow({
          id: laterId,
          workspaceId,
          projectId,
          number: 190,
          title: "Later cloud task",
          createdAt: laterCreated,
          updatedAt: laterCreated,
        }),
      },
    ],
    { direction: "pull" },
  );

  assert.equal(result.failed.length, 0);
  assert.equal(result.applied, 1);

  const [earlier] = await db.select().from(tasks).where(eq(tasks.id, earlierId));
  const [later] = await db.select().from(tasks).where(eq(tasks.id, laterId));
  assert.ok(earlier);
  assert.ok(later);
  assert.equal(earlier.deletedAt, null);
  assert.equal(later.deletedAt, null);
  assert.equal(earlier.number, 190);
  assert.ok(later.number > 190);
});
