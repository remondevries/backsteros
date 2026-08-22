import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cursorUsageTitle,
  daysUntilReset,
  formatDaysUntilReset,
  formatPlanPercent,
  formatUsdCents,
  planUsageTone,
  type CursorUsage,
} from "./cursor-usage.ts";

function usage(partial: Partial<CursorUsage> = {}): CursorUsage {
  return {
    available: true,
    autoPercentUsed: 3.012,
    apiPercentUsed: 0,
    totalPercentUsed: 2.4096,
    includedSpendCents: 6024,
    limitCents: 40000,
    remainingCents: 33976,
    displayMessage: "You've used 10% of your included usage",
    billingCycleEndMs: Date.parse("2026-09-06T15:24:36.000Z"),
    sampledAt: Date.now(),
    ...partial,
  };
}

describe("cursor-usage formatting", () => {
  it("formats percents", () => {
    assert.equal(formatPlanPercent(0), "0%");
    assert.equal(formatPlanPercent(0.4), "<1%");
    assert.equal(formatPlanPercent(85.3), "85%");
    assert.equal(formatPlanPercent(100), "100%");
  });

  it("formats usd cents", () => {
    assert.equal(formatUsdCents(40000), "$400");
    assert.equal(formatUsdCents(33976), "$339.76");
  });

  it("maps tone thresholds", () => {
    assert.equal(planUsageTone(10), "ok");
    assert.equal(planUsageTone(75), "warn");
    assert.equal(planUsageTone(95), "critical");
  });

  it("formats days until billing reset", () => {
    const now = Date.parse("2026-08-22T12:00:00.000Z");
    const end = Date.parse("2026-09-06T15:24:36.000Z");
    assert.equal(daysUntilReset(end, now), 16);
    assert.equal(formatDaysUntilReset(end, now), "16d");
    assert.equal(formatDaysUntilReset(end, end + 1), "0d");
    assert.equal(formatDaysUntilReset(end, end - 12 * 60 * 60 * 1000), "1d");
    assert.equal(formatDaysUntilReset(null, now), null);
  });

  it("builds a tooltip title", () => {
    const title = cursorUsageTitle(usage());
    assert.match(title, /Auto 3%/);
    assert.match(title, /API 0%/);
    assert.match(title, /\$339\.76 of \$400 left/);
    assert.match(title, /You've used 10%/);
  });

  it("includes Grok Bot weekly usage in the tooltip", () => {
    const title = cursorUsageTitle(
      usage({
        grokBotPercentUsed: 5.22,
        grokBotResetMs: Date.parse("2026-08-25T04:17:33.882Z"),
      }),
    );
    assert.match(title, /Grok Bot 5%/);
    assert.match(title, /Grok Bot resets/);
  });
});
