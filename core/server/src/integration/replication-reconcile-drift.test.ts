/**
 * Round 4: reconcile sees content drift at equal ids (entity_counters
 * next_value with identical updated_at) and enqueues the drifted rows both
 * ways instead of reporting "0 missing" forever.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  entityCounters,
  replicationReconcileMismatches,
  users,
  workspaces,
} from "../db/schema.js";
import {
  computeTableFingerprint,
  listReplicationRowDigests,
  reconcileTable,
} from "../services/core-replication/reconcile.js";

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
    name: "Reconcile WS",
    slug: id("rec"),
    ownerUserId: userId,
  });
  return { userId, workspaceId };
}

test("entity_counters fingerprint changes when only next_value changes", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const at = new Date("2026-11-01T10:00:00.000Z");

  context.after(async () => {
    await db.delete(entityCounters).where(eq(entityCounters.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(entityCounters).values({
    workspaceId,
    entity: "task",
    scopeId: "__inbox__",
    nextValue: 5,
    updatedAt: at,
  });
  const digestsBefore = await listReplicationRowDigests("entity_counters");
  const rowKey = `${workspaceId}|task|__inbox__`;
  const before = digestsBefore?.find((entry) => entry.key === rowKey);
  assert.ok(before, "counter digest listed");
  assert.match(before.digest, /\|5$/);

  await db
    .update(entityCounters)
    .set({ nextValue: 9, updatedAt: at })
    .where(
      and(
        eq(entityCounters.workspaceId, workspaceId),
        eq(entityCounters.scopeId, "__inbox__"),
      ),
    );
  const after = (await listReplicationRowDigests("entity_counters"))?.find(
    (entry) => entry.key === rowKey,
  );
  assert.match(after?.digest ?? "", /\|9$/);
  assert.ok(await computeTableFingerprint("entity_counters"));
});

test("reconcile with zero missing ids pulls and pushes drifted counter rows", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const at = "2026-11-01T10:00:00.000Z";
  const rowKey = `${workspaceId}|task|__inbox__`;
  const previousFetch = globalThis.fetch;
  const pushed: Array<{ table: string; changes: Array<{ row: Record<string, unknown> }> }> = [];

  context.after(async () => {
    globalThis.fetch = previousFetch;
    await db
      .delete(replicationReconcileMismatches)
      .where(eq(replicationReconcileMismatches.tableName, "entity_counters"));
    await db.delete(entityCounters).where(eq(entityCounters.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(entityCounters).values({
    workspaceId,
    entity: "task",
    scopeId: "__inbox__",
    nextValue: 5,
    updatedAt: new Date(at),
  });
  const localDigests = (await listReplicationRowDigests("entity_counters")) ?? [];
  const peerDigests = Object.fromEntries(
    localDigests.map((entry) => [entry.key, entry.digest] as const),
  );
  peerDigests[rowKey] = `${at}|9`;

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname.endsWith("/table-fingerprint")) {
      return json({
        table: "entity_counters",
        count: localDigests.length,
        fingerprint: "peer-differs",
      });
    }
    if (url.pathname.endsWith("/table-keys")) {
      assert.equal(url.searchParams.get("digests"), "1");
      return json({
        table: "entity_counters",
        keys: Object.keys(peerDigests),
        digests: peerDigests,
      });
    }
    if (url.pathname.endsWith("/rows")) {
      const body = JSON.parse(String(init?.body)) as { keys: string[] };
      assert.ok(body.keys.includes(rowKey));
      return json({
        table: "entity_counters",
        changes: [
          {
            table: "entity_counters",
            row: {
              workspace_id: workspaceId,
              entity: "task",
              scope_id: "__inbox__",
              next_value: 9,
              updated_at: at,
            },
          },
        ],
      });
    }
    if (url.pathname.endsWith("/apply")) {
      pushed.push(JSON.parse(String(init?.body)));
      return json({ applied: 1, skipped: 0, failed: [] });
    }
    throw new Error(`unexpected fetch ${url.pathname}`);
  }) as typeof fetch;

  await reconcileTable("entity_counters", "http://peer.test:8788", "secret");

  const [row] = await db
    .select()
    .from(entityCounters)
    .where(
      and(
        eq(entityCounters.workspaceId, workspaceId),
        eq(entityCounters.scopeId, "__inbox__"),
      ),
    );
  assert.equal(row?.nextValue, 9, "drifted row pulled from peer (max-merge)");
  assert.ok(
    pushed.some((call) =>
      call.changes.some((change) => change.row.workspace_id === workspaceId),
    ),
    "drifted row pushed to peer",
  );

  const [mismatch] = await db
    .select()
    .from(replicationReconcileMismatches)
    .where(eq(replicationReconcileMismatches.tableName, "entity_counters"));
  assert.equal(mismatch?.missingLocally, 0);
  assert.equal(mismatch?.missingOnPeer, 0);
});
