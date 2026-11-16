/**
 * Round 4: ordered sync-event pull must not look "caught up" when its cursor is
 * past the peer's log tip (peer restored / truncated) — it requests a resync.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  coreSyncEventReplicationState,
  users,
  workspaces,
} from "../db/schema.js";
import {
  getSyncEventPullCursor,
  pullWorkspaceSyncEvents,
  setSyncEventPullCursor,
} from "../services/core-replication/sync-event-replication.js";

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
    name: "Pull cursor WS",
    slug: id("pc"),
    ownerUserId: userId,
  });
  return { userId, workspaceId };
}

function feedResponse(workspaceId: string, afterCursor: number, lastSyncId: number) {
  return new Response(
    JSON.stringify({
      workspace_id: workspaceId,
      after: afterCursor,
      last_sync_id: lastSyncId,
      events: [],
      has_more: false,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("pull cursor ahead of the peer log tip requests resync instead of idling", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const previous = {
    peerUrl: process.env.CORE_REPLICATION_PEER_URL,
    secret: process.env.CORE_REPLICATION_SECRET,
    role: process.env.CORE_REPLICATION_ROLE,
  };
  process.env.CORE_REPLICATION_PEER_URL = "http://peer.test:8788";
  process.env.CORE_REPLICATION_SECRET = "pull-cursor-secret";
  process.env.CORE_REPLICATION_ROLE = "local";

  context.after(async () => {
    for (const [key, value] of [
      ["CORE_REPLICATION_PEER_URL", previous.peerUrl],
      ["CORE_REPLICATION_SECRET", previous.secret],
      ["CORE_REPLICATION_ROLE", previous.role],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db
      .delete(coreSyncEventReplicationState)
      .where(eq(coreSyncEventReplicationState.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await setSyncEventPullCursor(workspaceId, 500);

  const regressed = await pullWorkspaceSyncEvents(workspaceId, {
    fetchFn: async () => feedResponse(workspaceId, 500, 120),
  });
  assert.equal(regressed.resyncNeeded, true);
  assert.equal(regressed.applied, 0);
  assert.equal(
    await getSyncEventPullCursor(workspaceId),
    500,
    "cursor is left for the resync path to reset",
  );

  const prunedPeer = await pullWorkspaceSyncEvents(workspaceId, {
    fetchFn: async () => feedResponse(workspaceId, 500, 0),
  });
  assert.equal(prunedPeer.resyncNeeded, undefined, "fully pruned log is not a regression");

  const caughtUp = await pullWorkspaceSyncEvents(workspaceId, {
    fetchFn: async () => feedResponse(workspaceId, 500, 500),
  });
  assert.equal(caughtUp.resyncNeeded, undefined);
  assert.equal(caughtUp.stuck, undefined);
});
