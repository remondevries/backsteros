import assert from "node:assert/strict";
import test from "node:test";

import {
  clampEntityDetailPanelWidth,
  defaultEntityDetailPanelWidthPx,
} from "./entity-detail-panel-width.ts";

test("defaultEntityDetailPanelWidthPx uses 30% of parent row", () => {
  assert.equal(defaultEntityDetailPanelWidthPx(1000), 300);
});

test("clampEntityDetailPanelWidth respects min and max", () => {
  assert.equal(clampEntityDetailPanelWidth(100, 2000), 260);
  assert.equal(clampEntityDetailPanelWidth(900, 2000), 480);
});

test("clampEntityDetailPanelWidth caps at 55% of parent", () => {
  assert.equal(clampEntityDetailPanelWidth(400, 600), 330);
});
