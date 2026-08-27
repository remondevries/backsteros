import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  findFlatGroupedRowIndex,
  flattenGroupedSections,
} from "./flatten-grouped-sections.ts";

describe("flattenGroupedSections", () => {
  it("flattens headers, rows, and footers", () => {
    const { rows, stickyHeaderIndices, rowIndexByItemId } =
      flattenGroupedSections(
        [
          {
            key: "a",
            title: "A",
            data: [{ id: "1" }, { id: "2" }],
          },
        ],
        { includeEmptyFooter: () => false },
      );

    assert.equal(rows.length, 3);
    assert.deepEqual(stickyHeaderIndices, [0]);
    assert.equal(rowIndexByItemId.get("2"), 2);
    assert.equal(findFlatGroupedRowIndex(rowIndexByItemId, "2"), 2);
  });
});
