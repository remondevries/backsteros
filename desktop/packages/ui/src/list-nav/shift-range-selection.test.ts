import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyShiftRangeSelection } from "../../dist/list-nav/shift-range-selection.js";

describe("applyShiftRangeSelection", () => {
  const ordered = ["a", "b", "c", "d", "e"];

  it("toggles a single id without shift", () => {
    const { next, lastClickedId } = applyShiftRangeSelection(new Set(), "c", {
      shiftKey: false,
      orderedIds: ordered,
      lastClickedId: null,
    });
    assert.deepEqual([...next], ["c"]);
    assert.equal(lastClickedId, "c");
  });

  it("selects inclusive range on shift from anchor", () => {
    const { next } = applyShiftRangeSelection(new Set(["a"]), "d", {
      shiftKey: true,
      orderedIds: ordered,
      lastClickedId: "a",
    });
    assert.deepEqual([...next].sort(), ["a", "b", "c", "d"]);
  });

  it("works bottom-up and keeps prior selection outside the range", () => {
    const { next } = applyShiftRangeSelection(new Set(["e", "a"]), "c", {
      shiftKey: true,
      orderedIds: ordered,
      lastClickedId: "e",
    });
    assert.deepEqual([...next].sort(), ["a", "c", "d", "e"]);
  });
});
