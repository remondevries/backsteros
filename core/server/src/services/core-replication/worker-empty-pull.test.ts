import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { ReplicatedTable } from "./constants.js";
import {
  EMPTY_PULL_BACKOFF_BASE_MS,
  EMPTY_PULL_BACKOFF_MAX_MS,
  emptyPullBackoffMs,
  getEmptyPullStateForTests,
  notePullOutcome,
  resetEmptyPullStateForTests,
  shouldDeferEmptyPull,
} from "./empty-pull-backoff.js";

const TABLE = "tasks" as ReplicatedTable;
const CURSOR = { updatedAt: "2026-10-02T00:00:00.000Z", rowId: "row-1" };

describe("emptyPullBackoffMs", () => {
  it("doubles from the base and caps at EMPTY_PULL_BACKOFF_MAX_MS", () => {
    assert.equal(emptyPullBackoffMs(1), EMPTY_PULL_BACKOFF_BASE_MS);
    assert.equal(emptyPullBackoffMs(2), EMPTY_PULL_BACKOFF_BASE_MS * 2);
    assert.equal(emptyPullBackoffMs(3), EMPTY_PULL_BACKOFF_BASE_MS * 4);
    assert.equal(emptyPullBackoffMs(4), EMPTY_PULL_BACKOFF_MAX_MS);
    assert.equal(emptyPullBackoffMs(10), EMPTY_PULL_BACKOFF_MAX_MS);
  });
});

describe("empty pull deferral", () => {
  beforeEach(() => {
    resetEmptyPullStateForTests();
  });

  it("does not permanently skip after consecutive empties — only defers until nextPullAt", () => {
    const t0 = 1_000_000;
    notePullOutcome(TABLE, CURSOR, false, t0);
    const afterFirst = getEmptyPullStateForTests(TABLE);
    assert.ok(afterFirst);
    assert.equal(afterFirst.streak, 1);
    assert.equal(afterFirst.nextPullAtMs, t0 + EMPTY_PULL_BACKOFF_BASE_MS);

    assert.equal(shouldDeferEmptyPull(TABLE, CURSOR, t0 + 1), true);
    assert.equal(
      shouldDeferEmptyPull(TABLE, CURSOR, t0 + EMPTY_PULL_BACKOFF_BASE_MS),
      false,
    );

    notePullOutcome(TABLE, CURSOR, false, t0 + EMPTY_PULL_BACKOFF_BASE_MS);
    const afterSecond = getEmptyPullStateForTests(TABLE);
    assert.ok(afterSecond);
    assert.equal(afterSecond.streak, 2);
    assert.equal(
      afterSecond.nextPullAtMs,
      t0 + EMPTY_PULL_BACKOFF_BASE_MS + EMPTY_PULL_BACKOFF_BASE_MS * 2,
    );

    // Still re-checks after the longer backoff — never a permanent skip.
    notePullOutcome(TABLE, CURSOR, false, afterSecond.nextPullAtMs);
    notePullOutcome(TABLE, CURSOR, false, afterSecond.nextPullAtMs + 60_000);
    notePullOutcome(TABLE, CURSOR, false, afterSecond.nextPullAtMs + 180_000);
    const afterMany = getEmptyPullStateForTests(TABLE);
    assert.ok(afterMany);
    assert.ok(afterMany.streak >= 3);
    assert.equal(
      shouldDeferEmptyPull(TABLE, CURSOR, afterMany.nextPullAtMs - 1),
      true,
    );
    assert.equal(
      shouldDeferEmptyPull(TABLE, CURSOR, afterMany.nextPullAtMs),
      false,
    );
  });

  it("resets backoff on a non-empty result", () => {
    const t0 = 2_000_000;
    notePullOutcome(TABLE, CURSOR, false, t0);
    notePullOutcome(TABLE, CURSOR, false, t0 + EMPTY_PULL_BACKOFF_BASE_MS);
    assert.ok(getEmptyPullStateForTests(TABLE));

    notePullOutcome(TABLE, CURSOR, true, t0 + 60_000);
    assert.equal(getEmptyPullStateForTests(TABLE), undefined);
    assert.equal(shouldDeferEmptyPull(TABLE, CURSOR, t0 + 60_001), false);
  });

  it("resets streak when the cursor moves", () => {
    const t0 = 3_000_000;
    notePullOutcome(TABLE, CURSOR, false, t0);
    notePullOutcome(TABLE, CURSOR, false, t0 + EMPTY_PULL_BACKOFF_BASE_MS);

    const moved = { updatedAt: "2026-10-02T01:00:00.000Z", rowId: "row-2" };
    assert.equal(shouldDeferEmptyPull(TABLE, moved, t0 + 1), false);

    notePullOutcome(TABLE, moved, false, t0 + 1);
    const state = getEmptyPullStateForTests(TABLE);
    assert.ok(state);
    assert.equal(state.streak, 1);
    assert.equal(state.nextPullAtMs, t0 + 1 + EMPTY_PULL_BACKOFF_BASE_MS);
  });
});
