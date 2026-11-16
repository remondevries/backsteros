/**
 * Round 4: entity_counters merge (max next_value, max updated_at) instead of
 * LWW — equal timestamps and older-but-higher rows must never lose a bump.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { entityCounters, users, workspaces } from "../db/schema.js";
import { applyRemoteChanges } from "../services/core-replication/apply.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.CORE_REPLICATION_RECONCILE = "0";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

async function seedWorkspace() {
  const userId = id("user");
  const workspaceId = id("workspace");
  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Counter WS",
    slug: id("ctr"),
    ownerUserId: userId,
  });
  return { userId, workspaceId };
}

async function readCounter(workspaceId: string, scopeId: string) {
  const [row] = await db
    .select()
    .from(entityCounters)
    .where(
      and(
        eq(entityCounters.workspaceId, workspaceId),
        eq(entityCounters.entity, "task"),
        eq(entityCounters.scopeId, scopeId),
      ),
    );
  return row;
}

function counterRow(workspaceId: string, scopeId: string, next: number, at: string) {
  return {
    workspace_id: workspaceId,
    entity: "task",
    scope_id: scopeId,
    next_value: next,
    updated_at: at,
  };
}

test("equal timestamps with different next_value keep the max", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const scopeId = "__inbox__";
  const at = "2026-11-01T10:00:00.000Z";

  context.after(async () => {
    await db
      .delete(entityCounters)
      .where(eq(entityCounters.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(entityCounters).values({
    workspaceId,
    entity: "task",
    scopeId,
    nextValue: 5,
    updatedAt: new Date(at),
  });

  const higher = await applyRemoteChanges("entity_counters", [
    { table: "entity_counters", row: counterRow(workspaceId, scopeId, 9, at) },
  ]);
  assert.equal(higher.failed.length, 0);
  assert.equal(higher.applied, 1);
  assert.equal((await readCounter(workspaceId, scopeId))?.nextValue, 9);

  const lower = await applyRemoteChanges("entity_counters", [
    { table: "entity_counters", row: counterRow(workspaceId, scopeId, 6, at) },
  ]);
  assert.equal(lower.applied, 0);
  assert.equal(lower.skipped, 1);
  assert.equal((await readCounter(workspaceId, scopeId))?.nextValue, 9);
});

test("older remote with higher next_value raises; newer remote with lower never rolls back", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const scopeId = "__inbox__";
  const older = "2026-11-01T09:00:00.000Z";
  const newer = "2026-11-01T11:00:00.000Z";

  context.after(async () => {
    await db
      .delete(entityCounters)
      .where(eq(entityCounters.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(entityCounters).values({
    workspaceId,
    entity: "task",
    scopeId,
    nextValue: 5,
    updatedAt: new Date(newer),
  });

  await applyRemoteChanges("entity_counters", [
    { table: "entity_counters", row: counterRow(workspaceId, scopeId, 12, older) },
  ]);
  let row = await readCounter(workspaceId, scopeId);
  assert.equal(row?.nextValue, 12);
  assert.equal(row?.updatedAt.toISOString(), newer, "keeps the newer timestamp");

  const evenNewer = "2026-11-01T12:00:00.000Z";
  await applyRemoteChanges("entity_counters", [
    { table: "entity_counters", row: counterRow(workspaceId, scopeId, 3, evenNewer) },
  ]);
  row = await readCounter(workspaceId, scopeId);
  assert.equal(row?.nextValue, 12, "counter never rolls back");
  assert.equal(row?.updatedAt.toISOString(), evenNewer, "updated_at is the max");
});
