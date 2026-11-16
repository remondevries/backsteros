import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { priorYearAsOfExclusive } from "./prior-year-as-of.js";

describe("priorYearAsOfExclusive", () => {
  test("clamps Feb 29 to Feb 28 in a non-leap prior year", () => {
    // 2024-02-29 → prior exclusive end must be 2023-03-01 (after Feb 28), not Mar 2.
    assert.equal(priorYearAsOfExclusive(new Date(2024, 1, 29)), "2023-03-01");
  });

  test("keeps ordinary mid-month days", () => {
    assert.equal(priorYearAsOfExclusive(new Date(2026, 10, 16)), "2025-11-17");
  });
});
