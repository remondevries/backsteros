import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatAddress } from "./format-address.ts";
import { rowsShallowEqual } from "./rows-shallow-equal.ts";

describe("formatAddress", () => {
  it("returns null when all parts empty", () => {
    assert.equal(formatAddress({}), null);
    assert.equal(
      formatAddress({ address: "  ", city: "", postalCode: null }),
      null,
    );
  });

  it("joins street, postal+city, and country", () => {
    assert.equal(
      formatAddress({
        address: "1 Main",
        postalCode: "1000",
        city: "Amsterdam",
        country: "NL",
      }),
      "1 Main\n1000 Amsterdam\nNL",
    );
  });
});

describe("rowsShallowEqual", () => {
  it("treats same reference as equal", () => {
    const rows = [{ id: "a" }];
    assert.equal(rowsShallowEqual(rows, rows), true);
  });

  it("detects value changes", () => {
    assert.equal(
      rowsShallowEqual([{ id: "a", name: "x" }], [{ id: "a", name: "y" }]),
      false,
    );
  });

  it("detects length changes", () => {
    assert.equal(rowsShallowEqual([{ id: "a" }], []), false);
  });
});
