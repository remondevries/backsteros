import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyPendingUnpushedState,
  formatPendingUnpushedSummary,
  hasPendingUnpushedState,
  isExcludedFromPendingUnpushed,
  isPendingCoveredByAck,
  nextPendingAckSnapshot,
  parseAcknowledgePendingBody,
  resolveAcknowledgePendingSnapshot,
  shouldPauseSyncEventPull,
  summarizeUnpushedTables,
  sumLocalOnlyRows,
  toPendingAckSnapshot,
  type PendingUnpushedState,
} from "./pending-unpushed-policy.js";

function state(
  patch: Partial<PendingUnpushedState>,
): PendingUnpushedState {
  return { ...emptyPendingUnpushedState(), ...patch };
}

describe("pending unpushed state (OS-82)", () => {
  it("treats outbox rows, dead letters, and local-only rows as pending", () => {
    assert.equal(hasPendingUnpushedState(emptyPendingUnpushedState()), false);
    assert.equal(
      hasPendingUnpushedState(state({ unpushedRowCount: 2, unpushedTables: ["tasks"] })),
      true,
    );
    assert.equal(hasPendingUnpushedState(state({ openDeadLetterCount: 1 })), true);
    assert.equal(hasPendingUnpushedState(state({ localOnlyRowCount: 3 })), true);
  });

  it("ack covers the shown snapshot and re-pauses when a category grows", () => {
    const shown = state({
      unpushedRowCount: 2,
      openDeadLetterCount: 1,
      localOnlyRowCount: 0,
      unpushedTables: ["tasks"],
    });
    const ack = toPendingAckSnapshot(shown);
    assert.equal(shouldPauseSyncEventPull(shown, null), true);
    assert.equal(shouldPauseSyncEventPull(shown, ack), false);
    assert.equal(isPendingCoveredByAck(shown, ack), true);

    const newDeadLetter = state({
      unpushedRowCount: 2,
      openDeadLetterCount: 2,
      localOnlyRowCount: 0,
      unpushedTables: ["tasks"],
    });
    assert.equal(shouldPauseSyncEventPull(newDeadLetter, ack), true);
    assert.equal(isPendingCoveredByAck(newDeadLetter, ack), false);
  });

  it("clears ack once pending state is clean", () => {
    const ack = toPendingAckSnapshot(
      state({ unpushedRowCount: 1, openDeadLetterCount: 0, localOnlyRowCount: 0 }),
    );
    assert.equal(
      nextPendingAckSnapshot(emptyPendingUnpushedState(), ack),
      null,
    );
    assert.equal(
      nextPendingAckSnapshot(
        state({ unpushedRowCount: 1, unpushedTables: ["tasks"] }),
        ack,
      ),
      ack,
    );
  });

  it("acks min(shown, current); growth after dialog stays paused", () => {
    const shown = {
      unpushedRowCount: 0,
      openDeadLetterCount: 1,
      localOnlyRowCount: 0,
    };
    const current = state({
      unpushedRowCount: 0,
      openDeadLetterCount: 3,
      localOnlyRowCount: 0,
    });
    const ack = resolveAcknowledgePendingSnapshot(shown, current);
    assert.deepEqual(ack, {
      unpushedRowCount: 0,
      openDeadLetterCount: 1,
      localOnlyRowCount: 0,
    });
    assert.equal(shouldPauseSyncEventPull(current, ack), true);
    assert.equal(parseAcknowledgePendingBody(true), "invalid");
    assert.equal(
      parseAcknowledgePendingBody({
        unpushedRowCount: 0,
        openDeadLetterCount: 1,
        localOnlyRowCount: 0,
      })?.openDeadLetterCount,
      1,
    );
  });

  it("formats a compact summary for logs and the desktop prompt", () => {
    assert.equal(
      formatPendingUnpushedSummary(
        state({
          unpushedRowCount: 4,
          openDeadLetterCount: 1,
          localOnlyRowCount: 2,
          unpushedTables: ["tasks", "contacts"],
        }),
      ),
      "unpushed=4 deadLetters=1 localOnly=2 tables=tasks,contacts",
    );
  });

  it("excludes tables not pushed by design from the unpushed count", () => {
    assert.equal(isExcludedFromPendingUnpushed("api_keys"), true);
    assert.equal(isExcludedFromPendingUnpushed("tasks"), false);

    const summary = summarizeUnpushedTables([
      { table: "tasks", count: 2 },
      { table: "api_keys", count: 7 },
      { table: "contacts", count: 0 },
    ]);
    assert.deepEqual(summary, {
      unpushedRowCount: 2,
      unpushedTables: ["tasks"],
    });

    const onlyExcluded = summarizeUnpushedTables([
      { table: "api_keys", count: 3 },
    ]);
    assert.equal(onlyExcluded.unpushedRowCount, 0);
    assert.equal(
      hasPendingUnpushedState(
        state({
          unpushedRowCount: onlyExcluded.unpushedRowCount,
          unpushedTables: onlyExcluded.unpushedTables,
        }),
      ),
      false,
      "excluded tables never pause ordered sync-event pull",
    );
  });

  it("excluded tables do not inflate reconcile local-only rows either", () => {
    assert.equal(
      sumLocalOnlyRows([
        { tableName: "api_keys", missingOnPeer: 4 },
        { tableName: "tasks", missingOnPeer: 1 },
        { tableName: "contacts", missingOnPeer: null },
      ]),
      1,
    );
  });
});
