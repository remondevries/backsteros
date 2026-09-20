import { describe, expect, it } from "vitest";

import { fetchCursorUsage, parsePlanUsage, resolveCursorAccessToken } from "./cursorUsage.ts";

describe("parsePlanUsage", () => {
  it("maps Auto / Premium percent fields from the dashboard payload", () => {
    const usage = parsePlanUsage({
      billingCycleEnd: 1_791_300_276_000,
      displayMessage: "You've used 67% of your included usage",
      planUsage: {
        autoPercentUsed: 88.9,
        apiPercentUsed: 22.1,
        totalPercentUsed: 81.5,
        limit: 40_000,
        includedSpend: 12_000,
        remaining: 28_000,
      },
    });
    expect(usage).toMatchObject({
      available: true,
      autoPercentUsed: 88.9,
      apiPercentUsed: 22.1,
      totalPercentUsed: 81.5,
      limitCents: 40_000,
      includedSpendCents: 12_000,
      remainingCents: 28_000,
      billingCycleEndMs: 1_791_300_276_000,
    });
  });

  it("returns null when planUsage is missing", () => {
    expect(parsePlanUsage({})).toBeNull();
    expect(parsePlanUsage(null)).toBeNull();
  });
});

describe("resolveCursorAccessToken", () => {
  it("resolves the Cursor CLI keychain token when the IDE DB is absent", async () => {
    // This machine uses `agent login` (keychain) without an IDE state.vscdb.
    // Skip quietly in CI environments with no Cursor credentials.
    const token = await resolveCursorAccessToken();
    if (!token) {
      return;
    }
    expect(token.length).toBeGreaterThan(20);
    const usage = await fetchCursorUsage();
    expect(usage.available).toBe(true);
    expect(usage.autoPercentUsed).toBeGreaterThanOrEqual(0);
    expect(usage.apiPercentUsed).toBeGreaterThanOrEqual(0);
  });
});
