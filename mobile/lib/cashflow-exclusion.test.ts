import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildNonCashflowCategoryIdSet,
  isCashflowCategory,
  isCashflowTransaction,
} from "./cashflow-exclusion.ts";

describe("isCashflowCategory", () => {
  it("treats missing categories as cashflow", () => {
    assert.equal(isCashflowCategory(null), true);
    assert.equal(isCashflowCategory(undefined), true);
  });

  it("excludes transfer and excluded listings", () => {
    assert.equal(
      isCashflowCategory({ kind: "transfer", listing: "listed" }),
      false,
    );
    assert.equal(
      isCashflowCategory({ kind: "regular", listing: "excluded" }),
      false,
    );
    assert.equal(
      isCashflowCategory({ kind: "regular", listing: "listed" }),
      true,
    );
  });
});

describe("buildNonCashflowCategoryIdSet", () => {
  it("collects excluded ids", () => {
    const ids = buildNonCashflowCategoryIdSet([
      { id: "a", kind: "regular", listing: "listed" },
      { id: "b", kind: "transfer", listing: "listed" },
      { id: "c", kind: "regular", listing: "excluded" },
    ]);
    assert.deepEqual([...ids].sort(), ["b", "c"]);
  });
});

describe("isCashflowTransaction", () => {
  it("keeps uncategorized and omits excluded ids", () => {
    const exclude = new Set(["b"]);
    assert.equal(isCashflowTransaction({ categoryId: null }, exclude), true);
    assert.equal(isCashflowTransaction({ categoryId: "a" }, exclude), true);
    assert.equal(isCashflowTransaction({ categoryId: "b" }, exclude), false);
  });

  it("drops void settlements", () => {
    const exclude = new Set<string>();
    assert.equal(
      isCashflowTransaction(
        { categoryId: "a", settlementState: "refused" },
        exclude,
      ),
      false,
    );
  });
});
