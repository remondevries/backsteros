import assert from "node:assert/strict";
import { test } from "node:test";

import { dueDateValueToEpochMs } from "./row-mappers.ts";

test("dueDateValueToEpochMs keeps explicit null clears", () => {
  assert.equal(dueDateValueToEpochMs(null), null);
  assert.equal(dueDateValueToEpochMs(undefined), null);
  assert.equal(dueDateValueToEpochMs(""), null);
});

test("dueDateValueToEpochMs accepts epoch numbers and Dates", () => {
  const ms = Date.parse("2026-09-20T12:00:00.000Z");
  assert.equal(dueDateValueToEpochMs(ms), ms);
  assert.equal(dueDateValueToEpochMs(new Date(ms)), ms);
  assert.equal(dueDateValueToEpochMs("2026-09-20T12:00:00.000Z"), ms);
});
