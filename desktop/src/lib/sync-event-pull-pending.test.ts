import assert from "node:assert/strict";
import test from "node:test";

import { shouldPauseSyncEventPullForDeadLetters } from "./replication-dead-letters";
import {
  formatSyncEventPullPendingSummary,
  hasSyncEventPullPendingState,
  isSyncEventPullPendingCoveredByAck,
  shouldPauseSyncEventPullForPendingState,
  toSyncEventPullPendingAck,
} from "./sync-event-pull-pending";

test("OS-82 pending pause uses OS-84 dead-letter hook (count > 0)", () => {
  assert.equal(shouldPauseSyncEventPullForDeadLetters(0), false);
  assert.equal(shouldPauseSyncEventPullForDeadLetters(2), true);

  assert.equal(
    hasSyncEventPullPendingState({
      unpushedRowCount: 0,
      openDeadLetterCount: 0,
      localOnlyRowCount: 0,
    }),
    false,
  );
  assert.equal(
    hasSyncEventPullPendingState({
      unpushedRowCount: 0,
      openDeadLetterCount: 2,
      localOnlyRowCount: 0,
    }),
    true,
  );
});

test("OS-82 ack covers shown snapshot; new dead letter re-pauses", () => {
  const shown = {
    unpushedRowCount: 0,
    openDeadLetterCount: 2,
    localOnlyRowCount: 0,
  };
  const ack = toSyncEventPullPendingAck(shown);
  assert.equal(shouldPauseSyncEventPullForPendingState(shown, null), true);
  assert.equal(shouldPauseSyncEventPullForPendingState(shown, ack), false);
  assert.equal(isSyncEventPullPendingCoveredByAck(shown, ack), true);
  assert.equal(
    shouldPauseSyncEventPullForPendingState(
      {
        unpushedRowCount: 0,
        openDeadLetterCount: 3,
        localOnlyRowCount: 0,
      },
      ack,
    ),
    true,
  );
});

test("OS-82 pending pause covers unpushed and local-only rows", () => {
  assert.equal(
    shouldPauseSyncEventPullForPendingState(
      {
        unpushedRowCount: 3,
        openDeadLetterCount: 0,
        localOnlyRowCount: 0,
        unpushedTables: ["tasks"],
      },
      null,
    ),
    true,
  );
  assert.equal(
    shouldPauseSyncEventPullForPendingState(
      {
        unpushedRowCount: 0,
        openDeadLetterCount: 0,
        localOnlyRowCount: 1,
      },
      null,
    ),
    true,
  );
  assert.equal(
    formatSyncEventPullPendingSummary({
      unpushedRowCount: 3,
      openDeadLetterCount: 1,
      localOnlyRowCount: 2,
      unpushedTables: ["tasks"],
    }),
    "unpushed=3 deadLetters=1 localOnly=2 tables=tasks",
  );
});
