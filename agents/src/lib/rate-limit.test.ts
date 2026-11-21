import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeAgentsRateLimit,
  hashBearerForRateLimit,
  readAgentsRateLimitConfig,
  resetAgentsRateLimitForTests,
} from "./rate-limit.js";

test("hashBearerForRateLimit buckets missing auth as anon", () => {
  assert.equal(hashBearerForRateLimit(undefined), "anon");
  assert.equal(hashBearerForRateLimit(""), "anon");
  assert.notEqual(
    hashBearerForRateLimit("Bearer sk_live_abc"),
    hashBearerForRateLimit("Bearer sk_live_xyz"),
  );
});

test("agents rate limit blocks after rpm and sets retryAfterSec", () => {
  resetAgentsRateLimitForTests();
  const config = { enabled: true, rpm: 2, windowMs: 60_000 };
  const now = 5_000;
  assert.equal(consumeAgentsRateLimit("a", config, now).ok, true);
  assert.equal(consumeAgentsRateLimit("a", config, now).ok, true);
  const blocked = consumeAgentsRateLimit("a", config, now);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.ok(blocked.retryAfterSec >= 1);
});

test("AGENTS_RATE_LIMIT_RPM overrides API_KEY_RATE_LIMIT_RPM", () => {
  const cfg = readAgentsRateLimitConfig({
    API_KEY_RATE_LIMIT_RPM: "100",
    AGENTS_RATE_LIMIT_RPM: "50",
  });
  assert.equal(cfg.rpm, 50);
});
