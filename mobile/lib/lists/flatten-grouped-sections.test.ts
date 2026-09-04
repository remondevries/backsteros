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

  it("adds empty footers between sections but never after the last", () => {
    const { rows } = flattenGroupedSections(
      [
        { key: "a", title: "A", data: [] },
        { key: "b", title: "B", data: [] },
        { key: "c", title: "C", data: [] },
      ],
      { includeEmptyFooter: (section) => section.data.length === 0 },
    );

    assert.deepEqual(
      rows.map((row) => row.key),
      [
        "header:a",
        "footer:a",
        "header:b",
        "footer:b",
        "header:c",
      ],
    );
  });
});
