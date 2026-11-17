import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attachDeadLetterToFailedApply,
  applyRemoteChanges,
} from "./apply.js";
import { evaluateCursorHold } from "./cursor-order.js";

describe("attachDeadLetterToFailedApply (OS-174)", () => {
  it("marks deadLetterRecorded true and copies attempts on success", async () => {
    const result = await attachDeadLetterToFailedApply(
      { id: "row-1", code: "23505", message: "dup" },
      async () => ({ attempts: 2 }),
    );
    assert.deepEqual(result, {
      id: "row-1",
      code: "23505",
      message: "dup",
      attempts: 2,
      deadLetterRecorded: true,
    });
  });

  it("marks deadLetterRecorded false when the letter write throws", async () => {
    const result = await attachDeadLetterToFailedApply(
      { id: "row-1", code: "23505", message: "dup" },
      async () => {
        throw new Error("db down");
      },
    );
    assert.equal(result.deadLetterRecorded, false);
    assert.equal(result.attempts, undefined);
  });
});

describe("evaluateCursorHold with unrecorded failures (OS-174)", () => {
  it("keeps holding forever when deadLetterRecorded is false", () => {
    const decision = evaluateCursorHold(
      {
        failed: [
          {
            id: "x",
            attempts: 99,
            deadLetterRecorded: false,
          },
        ],
      },
      { attemptsFor: () => 99 },
    );
    assert.equal(decision.advance, false);
    assert.equal(decision.holding.length, 1);
    assert.equal(decision.exhausted.length, 0);
  });
});

describe("applyRemoteChanges dead-letter write failure (OS-174)", () => {
  it("returns failed entries marked unrecorded when recordDeadLetter throws", async () => {
    const result = await applyRemoteChanges(
      "tasks",
      [
        {
          table: "tasks",
          row: { id: "task-1", updated_at: "2026-11-17T00:00:00.000Z" },
        },
      ],
      {
        applyRow: async () => {
          throw new Error("apply boom");
        },
        recordDeadLetter: async () => {
          throw new Error("letter boom");
        },
      },
    );
    assert.equal(result.applied, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0]!.id, "task-1");
    assert.equal(result.failed[0]!.deadLetterRecorded, false);
    assert.equal(result.failed[0]!.attempts, undefined);
  });

  it("returns attempts when the dead letter is written", async () => {
    const result = await applyRemoteChanges(
      "tasks",
      [
        {
          table: "tasks",
          row: { id: "task-2", updated_at: "2026-11-17T00:00:00.000Z" },
        },
      ],
      {
        applyRow: async () => {
          throw new Error("apply boom");
        },
        recordDeadLetter: async () => ({ attempts: 3 }),
      },
    );
    assert.equal(result.failed[0]!.deadLetterRecorded, true);
    assert.equal(result.failed[0]!.attempts, 3);
  });
});
