import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  documents,
  replicationDeadLetters,
  spacePublishSettings,
  spaceSiteKeys,
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

after(async () => {
  await sqlClient.end();
});

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
  const existingKeyId = id("ssk");
  const incomingKeyId = id("ssk");
  const siteKeyPrefix = "dlpfx";
  const now = new Date().toISOString();

  context.after(async () => {
    await db
      .delete(replicationDeadLetters)
      .where(
        inArray(replicationDeadLetters.rowId, [incomingKeyId, existingKeyId]),
      );
    await db
      .delete(spaceSiteKeys)
      .where(eq(spaceSiteKeys.workspaceId, workspaceId));
    await db.delete(documents).where(eq(documents.id, spaceDocId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
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
  // space_site_keys has a unique index on (workspace_id, space_document_id,
  // site_key_prefix) and is not in NATURAL_KEY_TABLES, so a same-prefix fork
  // still 23505-dead-letters (unlike space_publish_settings after OS-40).
  await db.insert(spaceSiteKeys).values({
    id: existingKeyId,
    workspaceId,
    spaceDocumentId: spaceDocId,
    label: "local",
    siteKeyPrefix,
    siteKeyHash: "local-hash",
    updatedAt: new Date(now),
  });

  const beforeCursor = {
    updatedAt: new Date(0).toISOString(),
    rowId: "",
  };
  await setReplicationCursor("space_site_keys", beforeCursor, "pull");

  const incomingRow = {
    id: incomingKeyId,
    workspace_id: workspaceId,
    space_document_id: spaceDocId,
    label: "incoming",
    site_key_prefix: siteKeyPrefix,
    site_key_hash: "incoming-hash",
    created_at: now,
    updated_at: now,
  };

  const result = await applyRemoteChanges(
    "space_site_keys",
    [{ table: "space_site_keys", row: incomingRow }],
    { direction: "pull" },
  );

  assert.equal(result.applied, 0);
  assert.equal(result.skipped, 0, "apply exceptions must not count as skipped");
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.id, incomingKeyId);
  assert.equal(result.failed[0]?.code, "23505");

  const openCount = await countOpenReplicationDeadLetters();
  assert.ok(openCount >= 1);
  const open = await listOpenReplicationDeadLetters(50);
  const letter = open.find((row) => row.rowId === incomingKeyId);
  assert.ok(letter, "dead letter should appear for the failed row");
  assert.equal(letter.tableName, "space_site_keys");
  assert.equal(letter.direction, "pull");
  assert.equal(letter.attempts, 1);

  // Cursor still advances past the failed page tip (worker does this after apply).
  const advanced = {
    updatedAt: now,
    rowId: incomingKeyId,
  };
  await setReplicationCursor("space_site_keys", advanced, "pull");
  const cursor = await getReplicationCursor("space_site_keys", "pull");
  assert.equal(cursor.rowId, incomingKeyId);
  assert.equal(cursor.updatedAt, now);

  // Heal the conflict, then retry the dead letter.
  await db
    .delete(spaceSiteKeys)
    .where(eq(spaceSiteKeys.id, existingKeyId));

  await db
    .update(replicationDeadLetters)
    .set({ nextRetryAt: new Date(0) })
    .where(
      and(
        eq(replicationDeadLetters.rowId, incomingKeyId),
        isNull(replicationDeadLetters.resolvedAt),
      ),
    );

  const retry = await retryReplicationDeadLetters(applyReplicationRow);
  assert.ok(retry.resolved >= 1);

  const [appliedRow] = await db
    .select()
    .from(spaceSiteKeys)
    .where(eq(spaceSiteKeys.id, incomingKeyId))
    .limit(1);
  assert.ok(appliedRow, "retry should apply the previously failed row");

  const stillOpen = await db
    .select()
    .from(replicationDeadLetters)
    .where(
      and(
        eq(replicationDeadLetters.rowId, incomingKeyId),
        isNull(replicationDeadLetters.resolvedAt),
      ),
    );
  assert.equal(stillOpen.length, 0);

  // Re-recording the same failure collapses to one open letter (no spam).
  await db
    .delete(spaceSiteKeys)
    .where(eq(spaceSiteKeys.id, incomingKeyId));
  await db.insert(spaceSiteKeys).values({
    id: existingKeyId,
    workspaceId,
    spaceDocumentId: spaceDocId,
    label: "local",
    siteKeyPrefix,
    siteKeyHash: "local-hash",
    updatedAt: new Date(),
  });

  await recordReplicationDeadLetter({
    table: "space_site_keys",
    rowId: incomingKeyId,
    direction: "pull",
    errorCode: "23505",
    errorMessage: "duplicate key",
    row: incomingRow,
  });
  await recordReplicationDeadLetter({
    table: "space_site_keys",
    rowId: incomingKeyId,
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
        eq(replicationDeadLetters.rowId, incomingKeyId),
        isNull(replicationDeadLetters.resolvedAt),
      ),
    );
  assert.equal(dupOpen.length, 1);
  assert.equal(dupOpen[0]?.attempts, 1, "re-sight must not bump attempts");
  assert.match(dupOpen[0]?.errorMessage ?? "", /again/);
});

test("OS-40 natural-key healing on space_publish_settings with fixed timestamps", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const spaceDocId = id("doc");
  const localId = id("sps");
  const incomingId = id("sps");
  const older = "2026-09-13T17:41:20.092Z";
  const newer = "2026-09-13T18:21:18.316Z";

  context.after(async () => {
    await db
      .delete(spacePublishSettings)
      .where(eq(spacePublishSettings.workspaceId, workspaceId));
    await db.delete(documents).where(eq(documents.id, spaceDocId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "natural-key@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Natural key WS",
    slug: id("nk"),
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

  // Incoming newer -> applied; local twin deleted.
  await db.insert(spacePublishSettings).values({
    id: localId,
    workspaceId,
    spaceDocumentId: spaceDocId,
    publicBaseUrl: null,
    allowedDomains: [],
    updatedAt: new Date(older),
  });

  const newerIncoming = {
    id: incomingId,
    workspace_id: workspaceId,
    space_document_id: spaceDocId,
    public_base_url: "https://incoming-newer.test",
    allowed_domains: [],
    seo_meta: {},
    site_key_prefix: null,
    site_key_hash: null,
    site_key_created_at: null,
    created_at: newer,
    updated_at: newer,
  };

  const applied = await applyRemoteChanges(
    "space_publish_settings",
    [{ table: "space_publish_settings", row: newerIncoming }],
    { direction: "pull" },
  );
  assert.equal(applied.applied, 1);
  assert.equal(applied.skipped, 0);
  assert.equal(applied.failed.length, 0);

  const afterNewer = await db
    .select()
    .from(spacePublishSettings)
    .where(eq(spacePublishSettings.workspaceId, workspaceId));
  assert.equal(afterNewer.length, 1);
  assert.equal(afterNewer[0]?.id, incomingId);
  assert.equal(afterNewer[0]?.publicBaseUrl, "https://incoming-newer.test");

  // Local newer -> skipped; twin kept.
  await db
    .delete(spacePublishSettings)
    .where(eq(spacePublishSettings.workspaceId, workspaceId));
  await db.insert(spacePublishSettings).values({
    id: localId,
    workspaceId,
    spaceDocumentId: spaceDocId,
    publicBaseUrl: "https://local-newer.test",
    allowedDomains: [],
    updatedAt: new Date(newer),
  });

  const olderIncoming = {
    ...newerIncoming,
    public_base_url: "https://incoming-older.test",
    created_at: older,
    updated_at: older,
  };

  const skipped = await applyRemoteChanges(
    "space_publish_settings",
    [{ table: "space_publish_settings", row: olderIncoming }],
    { direction: "pull" },
  );
  assert.equal(skipped.applied, 0);
  assert.equal(skipped.skipped, 1);
  assert.equal(skipped.failed.length, 0);

  const afterOlder = await db
    .select()
    .from(spacePublishSettings)
    .where(eq(spacePublishSettings.workspaceId, workspaceId));
  assert.equal(afterOlder.length, 1);
  assert.equal(afterOlder[0]?.id, localId);
  assert.equal(afterOlder[0]?.publicBaseUrl, "https://local-newer.test");
});
