import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatPlanPercent,
  formatUsdCents,
  planUsageTone,
} from "./cursor-plan-usage-shared.ts";

describe("cursor-plan-usage-shared", () => {
  it("formats percents", () => {
    assert.equal(formatPlanPercent(0), "0%");
    assert.equal(formatPlanPercent(0.4), "<1%");
    assert.equal(formatPlanPercent(85.3), "85%");
    assert.equal(formatPlanPercent(100), "100%");
  });

  it("formats usd cents", () => {
    assert.equal(formatUsdCents(40000), "$400");
    assert.match(formatUsdCents(12345), /\$123\.45/);
  });

  it("maps tone thresholds", () => {
    assert.equal(planUsageTone(10), "ok");
    assert.equal(planUsageTone(75), "warn");
    assert.equal(planUsageTone(95), "critical");
  });
});
