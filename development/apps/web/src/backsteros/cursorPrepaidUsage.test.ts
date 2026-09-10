import { describe, expect, it } from "vite-plus/test";

import {
  colorForPrepaidModel,
  emptyCursorPrepaidUsage,
  estimatePrepaidIncludedOnDemand,
  formatPrepaidRangeLabel,
  isPrepaidRangeId,
  prepaidEventsToCsv,
} from "./cursorPrepaidUsage";

describe("cursorPrepaidUsage helpers", () => {
  it("validates range ids", () => {
    expect(isPrepaidRangeId("7d")).toBe(true);
    expect(isPrepaidRangeId("mtd")).toBe(true);
    expect(isPrepaidRangeId("nope")).toBe(false);
  });

  it("formats a UTC range label", () => {
    const label = formatPrepaidRangeLabel(
      Date.parse("2026-09-04T00:00:00.000Z"),
      Date.parse("2026-09-10T12:00:00.000Z"),
    );
    expect(label).toContain("Sep");
    expect(label).toContain("to");
  });

  it("assigns stable model colors", () => {
    const models = ["default", "composer-2.5-fast"];
    expect(colorForPrepaidModel("default", models)).toMatch(/^#/);
    expect(colorForPrepaidModel("composer-2.5-fast", models)).not.toBe(
      colorForPrepaidModel("default", models),
    );
  });

  it("exports csv rows", () => {
    const csv = prepaidEventsToCsv([
      {
        timestampMs: Date.parse("2026-09-10T14:52:00.000Z"),
        type: "included",
        model: "default",
        tokens: 1234,
        costLabel: "Included",
        chargedCents: 1.2,
      },
    ]);
    expect(csv).toContain("Date (UTC),Type,Model,Tokens,Cost");
    expect(csv).toContain("Included");
    expect(csv).toContain("default");
    expect(csv).toContain("1234");
  });

  it("builds an empty usage payload with pagination defaults", () => {
    const empty = emptyCursorPrepaidUsage("7d", "offline");
    expect(empty.page).toBe(1);
    expect(empty.pageSize).toBe(50);
    expect(empty.pageCount).toBe(1);
    expect(empty.events).toEqual([]);
  });

  it("scales included/on-demand from a sample onto the aggregate total", () => {
    const split = estimatePrepaidIncludedOnDemand(
      [
        {
          timestampMs: 1,
          type: "included",
          model: "a",
          tokens: 75,
          costLabel: "Included",
          chargedCents: null,
        },
        {
          timestampMs: 2,
          type: "on_demand",
          model: "b",
          tokens: 25,
          costLabel: "$0.01",
          chargedCents: 1,
        },
      ],
      1000,
    );
    expect(split.onDemandTokens).toBe(250);
    expect(split.includedTokens).toBe(750);
  });
});
