import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDeadLetterNextRetry,
  parseOpsSyncHealthDeadLetters,
  replicationDeadLetterAcknowledgePath,
  replicationDeadLetterRetryPath,
  shouldPauseSyncEventPullForDeadLetters,
} from "./replication-dead-letters";

test("shouldPauseSyncEventPullForDeadLetters is true when any letter is open", () => {
  assert.equal(shouldPauseSyncEventPullForDeadLetters(0), false);
  assert.equal(shouldPauseSyncEventPullForDeadLetters(1), true);
  assert.equal(shouldPauseSyncEventPullForDeadLetters(4), true);
});

test("parseOpsSyncHealthDeadLetters reads count, table, reason, retries, next retry", () => {
  const parsed = parseOpsSyncHealthDeadLetters({
    replicationDeadLetterCount: 2,
    replicationDeadLetters: [
      {
        id: "dl-1",
        tableName: "contacts",
        rowId: "row-1",
        direction: "pull",
        errorCode: "23505",
        errorMessage: "duplicate email",
        attempts: 3,
        firstSeenAt: "2026-10-06T10:00:00.000Z",
        lastSeenAt: "2026-10-06T11:00:00.000Z",
        nextRetryAt: "2026-10-06T12:00:00.000Z",
      },
    ],
  });
  assert.equal(parsed.count, 2);
  assert.equal(parsed.letters.length, 1);
  assert.equal(parsed.letters[0]?.tableName, "contacts");
  assert.equal(parsed.letters[0]?.errorMessage, "duplicate email");
  assert.equal(parsed.letters[0]?.attempts, 3);
  assert.equal(parsed.letters[0]?.nextRetryAt, "2026-10-06T12:00:00.000Z");
});

test("formatDeadLetterNextRetry uses due now vs remaining time", () => {
  const now = Date.parse("2026-10-06T12:00:00.000Z");
  assert.equal(
    formatDeadLetterNextRetry("2026-10-06T11:59:00.000Z", now),
    "due now",
  );
  assert.equal(
    formatDeadLetterNextRetry("2026-10-06T12:05:00.000Z", now),
    "in 5 minutes",
  );
  assert.equal(
    formatDeadLetterNextRetry("2026-10-06T13:00:00.000Z", now),
    "in 1 hour",
  );
});

test("retry and acknowledge paths encode the letter id", () => {
  assert.equal(
    replicationDeadLetterRetryPath("a/b"),
    "/api/v1/ops/replication-dead-letters/a%2Fb/retry",
  );
  assert.equal(
    replicationDeadLetterAcknowledgePath("a/b"),
    "/api/v1/ops/replication-dead-letters/a%2Fb/acknowledge",
  );
});
