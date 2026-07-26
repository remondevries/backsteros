import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dueDateToIso } from "./due-date.ts";

describe("dueDateToIso", () => {
  it("returns null for empty values", () => {
    assert.equal(dueDateToIso(null), null);
    assert.equal(dueDateToIso(undefined), null);
    assert.equal(dueDateToIso(""), null);
    assert.equal(dueDateToIso("   "), null);
  });

  it("converts YYYY-MM-DD to UTC noon ISO", () => {
    assert.equal(dueDateToIso("2026-07-26"), "2026-07-26T12:00:00.000Z");
  });

  it("passes through existing ISO datetimes", () => {
    assert.equal(
      dueDateToIso("2026-07-26T09:30:00.000Z"),
      "2026-07-26T09:30:00.000Z",
    );
  });

  it("converts Date instances", () => {
    const date = new Date("2026-07-26T09:30:00.000Z");
    assert.equal(dueDateToIso(date), "2026-07-26T09:30:00.000Z");
  });
});
