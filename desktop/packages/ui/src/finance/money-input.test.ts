import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatMoneyInput,
  moneyCentsToInput,
  parseMoneyInput,
} from "../../dist/finance/money-input.js";

describe("formatMoneyInput", () => {
  it("groups thousands with dots", () => {
    assert.equal(formatMoneyInput("100000"), "100.000");
    assert.equal(formatMoneyInput("182000000"), "182.000.000");
    assert.equal(formatMoneyInput("1000"), "1.000");
  });

  it("keeps a trailing decimal comma while typing", () => {
    assert.equal(formatMoneyInput("100,"), "100,");
    assert.equal(formatMoneyInput("100,5"), "100,5");
    assert.equal(formatMoneyInput("100,50"), "100,50");
  });

  it("reformats pasted dotted thousands", () => {
    assert.equal(formatMoneyInput("182.000.000"), "182.000.000");
  });
});

describe("parseMoneyInput", () => {
  it("parses dotted thousands to cents", () => {
    assert.equal(parseMoneyInput("100.000"), 10_000_000);
    assert.equal(parseMoneyInput("182.000.000"), 18_200_000_000);
    assert.equal(parseMoneyInput("100000"), 10_000_000);
  });

  it("parses decimal comma", () => {
    assert.equal(parseMoneyInput("100,50"), 10_050);
    assert.equal(parseMoneyInput("1.000,25"), 100_025);
  });

  it("treats a single dot with 1–2 decimals as a decimal", () => {
    assert.equal(parseMoneyInput("12.5"), 1_250);
    assert.equal(parseMoneyInput("12.50"), 1_250);
  });

  it("returns null for empty or negative", () => {
    assert.equal(parseMoneyInput(""), null);
    assert.equal(parseMoneyInput("   "), null);
    assert.equal(parseMoneyInput("-10"), null);
  });

  it("parses signed amounts when signed is enabled", () => {
    assert.equal(parseMoneyInput("-10", { signed: true }), -1_000);
    assert.equal(parseMoneyInput("-1.000,50", { signed: true }), -100_050);
    assert.equal(parseMoneyInput("-", { signed: true }), 0);
    assert.equal(parseMoneyInput("10", { signed: true }), 1_000);
  });

  it("rejects zero when positive is required", () => {
    assert.equal(parseMoneyInput("0", { positive: true }), null);
    assert.equal(parseMoneyInput("0"), 0);
  });
});

describe("formatMoneyInput signed", () => {
  it("preserves a leading minus while typing", () => {
    assert.equal(formatMoneyInput("-", { signed: true }), "-");
    assert.equal(formatMoneyInput("-1000", { signed: true }), "-1.000");
    assert.equal(formatMoneyInput("-100,5", { signed: true }), "-100,5");
  });
});

describe("moneyCentsToInput", () => {
  it("formats cents with thousand dots", () => {
    assert.equal(moneyCentsToInput(10_000_000), "100.000");
    assert.equal(moneyCentsToInput(18_200_000_000), "182.000.000");
  });

  it("uses a decimal comma for fractional euros", () => {
    assert.equal(moneyCentsToInput(10_050), "100,50");
    assert.equal(moneyCentsToInput(100_025), "1.000,25");
  });

  it("hides non-positive by default", () => {
    assert.equal(moneyCentsToInput(null), "");
    assert.equal(moneyCentsToInput(0), "");
    assert.equal(moneyCentsToInput(0, { allowZero: true }), "0");
  });

  it("can always include two fraction digits", () => {
    assert.equal(
      moneyCentsToInput(10_000_000, { alwaysFraction: true }),
      "100.000,00",
    );
    assert.equal(moneyCentsToInput(1_010, { alwaysFraction: true }), "10,10");
    assert.equal(
      moneyCentsToInput(0, { allowZero: true, alwaysFraction: true }),
      "0,00",
    );
  });
});
