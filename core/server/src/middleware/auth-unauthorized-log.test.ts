import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldEmitUnauthorizedLog,
  UNAUTHORIZED_LOG_INTERVAL_MS,
} from "./unauthorized-log.js";

test("shouldEmitUnauthorizedLog rate-limits the same bucket", () => {
  const lastAt = new Map<string, number>();
  const bucket = "ua|key|/api/v1/tasks";

  assert.equal(shouldEmitUnauthorizedLog(lastAt, bucket, 1_000), true);
  assert.equal(shouldEmitUnauthorizedLog(lastAt, bucket, 1_000 + 1), false);
  assert.equal(
    shouldEmitUnauthorizedLog(
      lastAt,
      bucket,
      1_000 + UNAUTHORIZED_LOG_INTERVAL_MS - 1,
    ),
    false,
  );
  assert.equal(
    shouldEmitUnauthorizedLog(
      lastAt,
      bucket,
      1_000 + UNAUTHORIZED_LOG_INTERVAL_MS,
    ),
    true,
  );
});

test("shouldEmitUnauthorizedLog isolates buckets by client", () => {
  const lastAt = new Map<string, number>();
  assert.equal(shouldEmitUnauthorizedLog(lastAt, "a", 10), true);
  assert.equal(shouldEmitUnauthorizedLog(lastAt, "b", 10), true);
  assert.equal(shouldEmitUnauthorizedLog(lastAt, "a", 11), false);
});
