import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyGrokBotUsage,
  looksLikeCursorSessionToken,
  parsePlanUsage,
} from "./cursor-usage.js";

describe("looksLikeCursorSessionToken", () => {
  it("detects JWTs vs API keys", () => {
    assert.equal(
      looksLikeCursorSessionToken(
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.signature",
      ),
      true,
    );
    assert.equal(looksLikeCursorSessionToken("crsr_abc123"), false);
    assert.equal(looksLikeCursorSessionToken("key_abc123"), false);
  });
});

describe("parsePlanUsage", () => {
  it("maps dashboard planUsage fields and tags the source", () => {
    const usage = parsePlanUsage(
      {
        billingCycleEnd: 1_788_708_276_000,
        displayMessage: "You've used 10% of your included usage",
        planUsage: {
          limit: 40000,
          remaining: 33976,
          includedSpend: 6024,
          totalSpend: 6024,
          autoPercentUsed: 3.012,
          apiPercentUsed: 0,
          totalPercentUsed: 2.4096,
        },
      },
      "settings_api_key",
    );
    assert.ok(usage);
    assert.equal(usage.available, true);
    assert.equal(usage.source, "settings_api_key");
    assert.equal(usage.limitCents, 40000);
    assert.equal(usage.remainingCents, 33976);
    assert.equal(usage.error, null);
  });

  it("returns null without planUsage", () => {
    assert.equal(parsePlanUsage({ displayMessage: "x" }), null);
  });
});

describe("applyGrokBotUsage", () => {
  it("fills weekly Grok percent when the account has a quota", () => {
    const base = parsePlanUsage({
      planUsage: {
        limit: 40000,
        autoPercentUsed: 1,
        apiPercentUsed: 2,
        totalPercentUsed: 1.5,
      },
    });
    assert.ok(base);
    const next = applyGrokBotUsage(base, {
      usagePercent: 5.2,
      hasNonZeroIncludedLimit: true,
      nextResetTimestampUtc: "2026-08-25T04:17:33.882Z",
    });
    assert.equal(next.grokBotPercentUsed, 5.2);
    assert.equal(next.grokBotResetMs, 1_787_631_453_882);
  });

  it("accepts numeric nextResetTimestampUtc as well as ISO strings", () => {
    const base = parsePlanUsage({
      planUsage: {
        limit: 40000,
        autoPercentUsed: 0,
        apiPercentUsed: 0,
        totalPercentUsed: 0,
      },
    });
    assert.ok(base);
    const next = applyGrokBotUsage(base, {
      usagePercent: 1,
      hasNonZeroIncludedLimit: true,
      nextResetTimestampUtc: 1_787_631_453_882,
    });
    assert.equal(next.grokBotResetMs, 1_787_631_453_882);
  });
});
