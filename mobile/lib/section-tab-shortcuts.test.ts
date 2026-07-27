import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSectionTabIndex } from "./section-tab-shortcuts.ts";

describe("parseSectionTabIndex", () => {
  it("maps digit characters 1–9 to zero-based indices", () => {
    assert.equal(parseSectionTabIndex("Digit1", "1"), 0);
    assert.equal(parseSectionTabIndex("3", "3"), 2);
    assert.equal(parseSectionTabIndex("Digit5"), 4);
  });

  it("rejects 0 and non-digits", () => {
    assert.equal(parseSectionTabIndex("Digit0", "0"), null);
    assert.equal(parseSectionTabIndex("KeyA", "a"), null);
    assert.equal(parseSectionTabIndex("Enter"), null);
  });
});
