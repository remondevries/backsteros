import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyPendingUnpushedState,
  formatPendingUnpushedSummary,
  hasPendingUnpushedState,
  shouldPauseSyncEventPull,
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

  it("pauses pull until pending state is acknowledged", () => {
    const pending = state({ unpushedRowCount: 1, unpushedTables: ["tasks"] });
    assert.equal(shouldPauseSyncEventPull(pending, false), true);
    assert.equal(shouldPauseSyncEventPull(pending, true), false);
    assert.equal(shouldPauseSyncEventPull(emptyPendingUnpushedState(), false), false);
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
});
