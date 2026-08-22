import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_TX_CATEGORY_COLUMN_PX,
  TX_CATEGORY_CHIP_CHROME_PX,
  TX_CATEGORY_COLUMN_SLACK_PX,
  computeTxCategoryColumnWidthPx,
} from "../../dist/finance/finance-tx-category-column-width.js";

describe("computeTxCategoryColumnWidthPx", () => {
  it("returns at least the default minimum without DOM measurement", () => {
    // Under node:test there is no document — measure returns 0, so minPx wins.
    assert.equal(
      computeTxCategoryColumnWidthPx([]),
      DEFAULT_TX_CATEGORY_COLUMN_PX,
    );
    assert.equal(
      computeTxCategoryColumnWidthPx(["Groceries"], { minPx: 200 }),
      200,
    );
  });

  it("exposes chrome constants used for chip padding + dot", () => {
    assert.equal(TX_CATEGORY_CHIP_CHROME_PX, 30);
    assert.equal(TX_CATEGORY_COLUMN_SLACK_PX, 4);
  });
});
