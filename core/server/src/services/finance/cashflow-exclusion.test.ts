import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCashflowCategory } from "./cashflow-exclusion.js";

describe("isCashflowCategory", () => {
  it("counts uncategorized as cashflow", () => {
    assert.equal(isCashflowCategory(null), true);
    assert.equal(isCashflowCategory(undefined), true);
  });

  it("counts regular expense and income", () => {
    assert.equal(
      isCashflowCategory({ kind: "expense", listing: "regular" }),
      true,
    );
    assert.equal(
      isCashflowCategory({ kind: "income", listing: "regular" }),
      true,
    );
  });

  it("omits transfer kind and excluded listing", () => {
    assert.equal(
      isCashflowCategory({ kind: "transfer", listing: "regular" }),
      false,
    );
    assert.equal(
      isCashflowCategory({ kind: "expense", listing: "excluded" }),
      false,
    );
    assert.equal(
      isCashflowCategory({ kind: "transfer", listing: "excluded" }),
      false,
    );
  });

  it("treats soft-deleted categories as cashflow (like uncategorized)", () => {
    assert.equal(
      isCashflowCategory({
        kind: "transfer",
        listing: "excluded",
        deletedAt: new Date(),
      }),
      true,
    );
  });
});
