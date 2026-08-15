import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildNonCashflowCategoryIdSet,
  isCashflowCategory,
  isCashflowTransaction,
} from "../dist/cashflow-exclusion.js";

describe("isCashflowCategory", () => {
  it("counts uncategorized and regular categories", () => {
    assert.equal(isCashflowCategory(null), true);
    assert.equal(
      isCashflowCategory({
        id: "1",
        kind: "expense",
        listing: "regular",
      }),
      true,
    );
  });

  it("omits transfer and excluded", () => {
    assert.equal(
      isCashflowCategory({
        id: "t",
        kind: "transfer",
        listing: "regular",
      }),
      false,
    );
    assert.equal(
      isCashflowCategory({
        id: "e",
        kind: "expense",
        listing: "excluded",
      }),
      false,
    );
  });
});

describe("buildNonCashflowCategoryIdSet", () => {
  it("collects transfer and excluded ids", () => {
    const ids = buildNonCashflowCategoryIdSet([
      { id: "a", kind: "expense", listing: "regular" },
      { id: "b", kind: "transfer", listing: "excluded" },
      { id: "c", kind: "expense", listing: "excluded" },
    ]);
    assert.deepEqual([...ids].sort(), ["b", "c"]);
  });
});

describe("isCashflowTransaction", () => {
  it("keeps uncategorized and drops listed ids", () => {
    const excluded = new Set(["b"]);
    assert.equal(isCashflowTransaction({ categoryId: null }, excluded), true);
    assert.equal(isCashflowTransaction({ categoryId: "a" }, excluded), true);
    assert.equal(isCashflowTransaction({ categoryId: "b" }, excluded), false);
  });
});
