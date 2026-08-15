import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryNetSpendAbsCents,
  categoryNetSpendDisplayCents,
  categoryNetSpendSign,
  toCategoryNetSpendCents,
} from "./category-net-spend.js";

test("toCategoryNetSpendCents flips cashflow polarity", () => {
  assert.equal(toCategoryNetSpendCents(-10_000), 10_000);
  assert.equal(toCategoryNetSpendCents(4_000), -4_000);
  assert.equal(toCategoryNetSpendCents(0), 0);
});

test("restaurant dinner + reimbursement nets to lower spend", () => {
  const dinner = toCategoryNetSpendCents(-100_00);
  const repayment = toCategoryNetSpendCents(40_00);
  const net = dinner + repayment;
  assert.equal(net, 60_00);
  assert.equal(categoryNetSpendSign(net), "debit");
  assert.equal(categoryNetSpendAbsCents(net), 60_00);
});

test("categoryNetSpendSign distinguishes debit credit and zero", () => {
  assert.equal(categoryNetSpendSign(1), "debit");
  assert.equal(categoryNetSpendSign(-1), "credit");
  assert.equal(categoryNetSpendSign(0), "zero");
});

test("categoryNetSpendDisplayCents uses cashflow polarity for formatting", () => {
  assert.equal(categoryNetSpendDisplayCents(60_00), -60_00);
  assert.equal(categoryNetSpendDisplayCents(-40_00), 40_00);
  assert.equal(categoryNetSpendDisplayCents(0), 0);
});
