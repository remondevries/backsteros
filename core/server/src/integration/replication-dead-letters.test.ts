import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  documents,
  replicationDeadLetters,
  spacePublishSettings,
  users,
  workspaces,
} from "../db/schema.js";
import { applyRemoteChanges, applyReplicationRow } from "../services/core-replication/apply.js";
import {
  countOpenReplicationDeadLetters,
  deadLetterBackoffMs,
  listOpenReplicationDeadLetters,
  recordReplicationDeadLetter,
  retryReplicationDeadLetters,
} from "../services/core-replication/dead-letters.js";
import { setReplicationCursor, getReplicationCursor } from "../services/core-replication/cursors.js";
import { isReplicationReconcileEnabled } from "../services/core-replication/reconcile-gate.js";

// Never let reconcile touch a peer during this suite.
process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.CORE_REPLICATION_RECONCILE = "0";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

test("deadLetterBackoffMs doubles up to one hour", () => {
  assert.equal(deadLetterBackoffMs(1), 60_000);
  assert.equal(deadLetterBackoffMs(2), 120_000);
  assert.equal(deadLetterBackoffMs(3), 240_000);
  assert.equal(deadLetterBackoffMs(20), 3_600_000);
});

test("isReplicationReconcileEnabled is off under integration/test flags", () => {
  assert.equal(isReplicationReconcileEnabled(process.env), false);
  assert.equal(
    isReplicationReconcileEnabled({ CORE_REPLICATION_RECONCILE: "0" }),
    false,
  );
  assert.equal(
    isReplicationReconcileEnabled({ NODE_ENV: "production" }),
    true,
  );
});

test("failed unique apply becomes a dead letter; cursor can still advance; retry heals", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const spaceDocId = id("doc");
  const existingSettingsId = id("sps");
  const incomingSettingsId = id("sps");
  const now = new Date().toISOString();

  context.after(async () => {
    await db
      .delete(replicationDeadLetters)
      .where(
        inArray(replicationDeadLetters.rowId, [
          incomingSettingsId,
          existingSettingsId,
        ]),
      );
    await db
      .delete(spacePublishSettings)
      .where(eq(spacePublishSettings.workspaceId, workspaceId));
    await db.delete(documents).where(eq(documents.id, spaceDocId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "dead-letter@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Dead letter WS",
    slug: id("dl"),
    ownerUserId: userId,
  });
  await db.insert(documents).values({
    id: spaceDocId,
    workspaceId,
    type: "folder",
    kind: "space",
    path: `/spaces/${spaceDocId}`,
    title: "Space",
    storageKey: `vault/spaces/${spaceDocId}`,
  });
  await db.insert(spacePublishSettings).values({
    id: existingSettingsId,
    workspaceId,
    spaceDocumentId: spaceDocId,
    publicBaseUrl: null,
    allowedDomains: [],
    updatedAt: new Date(now),
  });

  const beforeCursor = {
    updatedAt: new Date(0).toISOString(),
    rowId: "",
  };
  await setReplicationCursor("space_publish_settings", beforeCursor, "pull");

  const incomingRow = {
    id: incomingSettingsId,
    workspace_id: workspaceId,
    space_document_id: spaceDocId,
    public_base_url: "https://example.test",
    allowed_domains: [],
    seo_meta: {},
    site_key_prefix: null,
    site_key_hash: null,
    site_key_created_at: null,
    created_at: now,
    updated_at: now,
  };

  const result = await applyRemoteChanges(
    "space_publish_settings",
    [{ table: "space_publish_settings", row: incomingRow }],
    { direction: "pull" },
  );

  assert.equal(result.applied, 0);
  assert.equal(result.skipped, 0, "apply exceptions must not count as skipped");
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.id, incomingSettingsId);
  assert.equal(result.failed[0]?.code, "23505");

  const openCount = await countOpenReplicationDeadLetters();
  assert.ok(openCount >= 1);
  const open = await listOpenReplicationDeadLetters(50);
  const letter = open.find((row) => row.rowId === incomingSettingsId);
  assert.ok(letter, "dead letter should appear for the failed row");
  assert.equal(letter.tableName, "space_publish_settings");
  assert.equal(letter.direction, "pull");
  assert.equal(letter.attempts, 1);

  // Cursor still advances past the failed page tip (worker does this after apply).
  const advanced = {
    updatedAt: now,
    rowId: incomingSettingsId,
  };
  await setReplicationCursor("space_publish_settings", advanced, "pull");
  const cursor = await getReplicationCursor("space_publish_settings", "pull");
  assert.equal(cursor.rowId, incomingSettingsId);
  assert.equal(cursor.updatedAt, now);

  // Heal the conflict, then retry the dead letter.
  await db
    .delete(spacePublishSettings)
    .where(eq(spacePublishSettings.id, existingSettingsId));

  await db
    .update(replicationDeadLetters)
    .set({ nextRetryAt: new Date(0) })
    .where(
      and(
        eq(replicationDeadLetters.rowId, incomingSettingsId),
        isNull(replicationDeadLetters.resolvedAt),
      ),
    );

  const retry = await retryReplicationDeadLetters(applyReplicationRow);
  assert.ok(retry.resolved >= 1);

  const [appliedRow] = await db
    .select()
    .from(spacePublishSettings)
    .where(eq(spacePublishSettings.id, incomingSettingsId))
    .limit(1);
  assert.ok(appliedRow, "retry should apply the previously failed row");

  const stillOpen = await db
    .select()
    .from(replicationDeadLetters)
    .where(
      and(
        eq(replicationDeadLetters.rowId, incomingSettingsId),
        isNull(replicationDeadLetters.resolvedAt),
      ),
    );
  assert.equal(stillOpen.length, 0);

  // Re-recording the same failure collapses to one open letter (no spam).
  await db
    .delete(spacePublishSettings)
    .where(eq(spacePublishSettings.id, incomingSettingsId));
  await db.insert(spacePublishSettings).values({
    id: existingSettingsId,
    workspaceId,
    spaceDocumentId: spaceDocId,
    publicBaseUrl: null,
    allowedDomains: [],
    updatedAt: new Date(),
  });

  await recordReplicationDeadLetter({
    table: "space_publish_settings",
    rowId: incomingSettingsId,
    direction: "pull",
    errorCode: "23505",
    errorMessage: "duplicate key",
    row: incomingRow,
  });
  await recordReplicationDeadLetter({
    table: "space_publish_settings",
    rowId: incomingSettingsId,
    direction: "pull",
    errorCode: "23505",
    errorMessage: "duplicate key again",
    row: incomingRow,
  });
  const dupOpen = await db
    .select()
    .from(replicationDeadLetters)
    .where(
      and(
        eq(replicationDeadLetters.rowId, incomingSettingsId),
        isNull(replicationDeadLetters.resolvedAt),
      ),
    );
  assert.equal(dupOpen.length, 1);
  assert.equal(dupOpen[0]?.attempts, 1, "re-sight must not bump attempts");
  assert.match(dupOpen[0]?.errorMessage ?? "", /again/);
});
