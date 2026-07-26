import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertValidCronExpression,
  getNextCronDate,
  parseCronExpression,
} from "./cron.js";

test("parseCronExpression accepts hourly and daily patterns", () => {
  const hourly = parseCronExpression("0 * * * *");
  assert.ok(hourly[0].has(0));
  assert.equal(hourly[1].size, 24);

  assertValidCronExpression("30 9 * * 1");
});

test("getNextCronDate returns the next UTC match", () => {
  const from = new Date("2026-07-25T08:15:00.000Z");
  const next = getNextCronDate("0 9 * * *", from);
  assert.equal(next.toISOString(), "2026-07-25T09:00:00.000Z");
});

test("getNextCronDate handles step minutes", () => {
  const from = new Date("2026-07-25T10:07:00.000Z");
  const next = getNextCronDate("*/15 * * * *", from);
  assert.equal(next.toISOString(), "2026-07-25T10:15:00.000Z");
});

test("assertValidCronExpression rejects bad input", () => {
  assert.throws(() => assertValidCronExpression("not cron"), /5 fields|Invalid/);
  assert.throws(() => assertValidCronExpression("60 * * * *"), /Invalid/);
});
