import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { replicationDeadLetters } from "../db/schema.js";
import {
  acknowledgeReplicationDeadLetter,
  listOpenReplicationDeadLetters,
  retryReplicationDeadLetterById,
} from "../services/core-replication/dead-letters.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

test("acknowledgeReplicationDeadLetter resolves without applying", async (context) => {
  const letterId = id("dl");
  const rowId = id("row");
  context.after(async () => {
    await db
      .delete(replicationDeadLetters)
      .where(eq(replicationDeadLetters.id, letterId));
  });

  await db.insert(replicationDeadLetters).values({
    id: letterId,
    tableName: "contacts",
    rowId,
    direction: "pull",
    errorCode: "23505",
    errorMessage: "duplicate email",
    rowPayload: { id: rowId },
    attempts: 3,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    nextRetryAt: new Date(Date.now() + 60_000),
    resolvedAt: null,
  });

  const listedBefore = await listOpenReplicationDeadLetters(200);
  assert.ok(listedBefore.some((row) => row.id === letterId));

  const result = await acknowledgeReplicationDeadLetter(letterId);
  assert.equal(result.status, "acknowledged");

  const [row] = await db
    .select()
    .from(replicationDeadLetters)
    .where(eq(replicationDeadLetters.id, letterId))
    .limit(1);
  assert.ok(row?.resolvedAt);

  const listedAfter = await listOpenReplicationDeadLetters(200);
  assert.equal(
    listedAfter.some((entry) => entry.id === letterId),
    false,
  );
});

test("retryReplicationDeadLetterById applies even when next retry is in the future", async (context) => {
  const letterId = id("dl");
  const rowId = id("row");
  context.after(async () => {
    await db
      .delete(replicationDeadLetters)
      .where(eq(replicationDeadLetters.id, letterId));
  });

  await db.insert(replicationDeadLetters).values({
    id: letterId,
    tableName: "contacts",
    rowId,
    direction: "push",
    errorCode: "23505",
    errorMessage: "duplicate email",
    rowPayload: { id: rowId },
    attempts: 2,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    nextRetryAt: new Date(Date.now() + 3_600_000),
    resolvedAt: null,
  });

  const failed = await retryReplicationDeadLetterById(letterId, async () => {
    throw new Error("still broken");
  });
  assert.equal(failed.status, "failed");

  const [afterFail] = await db
    .select()
    .from(replicationDeadLetters)
    .where(eq(replicationDeadLetters.id, letterId))
    .limit(1);
  assert.equal(afterFail?.resolvedAt, null);
  assert.equal(afterFail?.attempts, 3);

  const resolved = await retryReplicationDeadLetterById(
    letterId,
    async () => "applied",
  );
  assert.equal(resolved.status, "resolved");

  const [afterOk] = await db
    .select()
    .from(replicationDeadLetters)
    .where(eq(replicationDeadLetters.id, letterId))
    .limit(1);
  assert.ok(afterOk?.resolvedAt);
});

test("retry and acknowledge miss unknown ids", async () => {
  const retry = await retryReplicationDeadLetterById("missing-dl", async () => {
    throw new Error("should not apply");
  });
  assert.equal(retry.status, "not_found");
  const ack = await acknowledgeReplicationDeadLetter("missing-dl");
  assert.equal(ack.status, "not_found");
});
