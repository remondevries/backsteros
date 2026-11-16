import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeEntityCounter } from "./entity-counter-merge.js";

const older = new Date("2026-11-01T10:00:00.000Z");
const newer = new Date("2026-11-01T11:00:00.000Z");

describe("mergeEntityCounter", () => {
  it("inserts the remote state when there is no local row", () => {
    const merged = mergeEntityCounter(null, { nextValue: 7, updatedAt: newer });
    assert.deepEqual(merged, { nextValue: 7, updatedAt: newer, changed: true });
  });

  it("equal timestamps, different next_value: keeps the max", () => {
    const local = { nextValue: 5, updatedAt: newer };
    const remote = { nextValue: 9, updatedAt: newer };
    const merged = mergeEntityCounter(local, remote);
    assert.equal(merged.nextValue, 9);
    assert.equal(merged.updatedAt.getTime(), newer.getTime());
    assert.equal(merged.changed, true);

    // Symmetric: the other core applying our row keeps 9 as well.
    const reverse = mergeEntityCounter(remote, local);
    assert.equal(reverse.nextValue, 9);
    assert.equal(reverse.changed, false);
  });

  it("older remote with a higher next_value still raises the counter", () => {
    const merged = mergeEntityCounter(
      { nextValue: 5, updatedAt: newer },
      { nextValue: 12, updatedAt: older },
    );
    assert.equal(merged.nextValue, 12);
    assert.equal(merged.updatedAt.getTime(), newer.getTime());
    assert.equal(merged.changed, true);
  });

  it("newer remote with a lower next_value never rolls the counter back", () => {
    const merged = mergeEntityCounter(
      { nextValue: 12, updatedAt: older },
      { nextValue: 5, updatedAt: newer },
    );
    assert.equal(merged.nextValue, 12);
    assert.equal(merged.updatedAt.getTime(), newer.getTime());
    assert.equal(merged.changed, true);
  });

  it("is a no-op when the remote is identical or dominated", () => {
    const merged = mergeEntityCounter(
      { nextValue: 12, updatedAt: newer },
      { nextValue: 12, updatedAt: newer },
    );
    assert.equal(merged.changed, false);
    const dominated = mergeEntityCounter(
      { nextValue: 12, updatedAt: newer },
      { nextValue: 3, updatedAt: older },
    );
    assert.equal(dominated.changed, false);
    assert.equal(dominated.nextValue, 12);
  });

  it("ignores an unparseable remote timestamp but still merges next_value", () => {
    const merged = mergeEntityCounter(
      { nextValue: 3, updatedAt: older },
      { nextValue: 8, updatedAt: new Date("nope") },
    );
    assert.equal(merged.nextValue, 8);
    assert.equal(merged.updatedAt.getTime(), older.getTime());
  });
});
