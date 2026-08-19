import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getRememberedFinanceSection,
  rememberFinanceSection,
} from "./finance-section-memory.ts";

describe("finance-section-memory", () => {
  it("remembers the last section across reads", () => {
    rememberFinanceSection("dashboard");
    assert.equal(getRememberedFinanceSection(), "dashboard");
    rememberFinanceSection("transactions");
    assert.equal(getRememberedFinanceSection(), "transactions");
    rememberFinanceSection("categories");
    assert.equal(getRememberedFinanceSection(), "categories");
  });
});
