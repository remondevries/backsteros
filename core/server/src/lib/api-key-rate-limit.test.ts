import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import {
  consumeApiKeyRateLimit,
  readApiKeyRateLimitConfig,
  resetApiKeyRateLimitForTests,
  setApiKeyRateLimitConfigForTests,
} from "./api-key-rate-limit.js";
import type { AuthContext } from "../middleware/auth.js";
import { apiKeyRateLimit } from "../middleware/api-key-rate-limit.js";

test("readApiKeyRateLimitConfig parses env", () => {
  assert.deepEqual(
    readApiKeyRateLimitConfig({
      API_KEY_RATE_LIMIT_ENABLED: "1",
      API_KEY_RATE_LIMIT_RPM: "120",
    }),
    { enabled: true, rpm: 120, windowMs: 60_000 },
  );
  assert.equal(
    readApiKeyRateLimitConfig({ API_KEY_RATE_LIMIT_ENABLED: "0" }).enabled,
    false,
  );
});

test("consumeApiKeyRateLimit returns 429 shape after rpm", () => {
  resetApiKeyRateLimitForTests();
  const config = { enabled: true, rpm: 3, windowMs: 60_000 };
  const now = 1_000_000;
  assert.equal(consumeApiKeyRateLimit("k1", config, now).ok, true);
  assert.equal(consumeApiKeyRateLimit("k1", config, now).ok, true);
  assert.equal(consumeApiKeyRateLimit("k1", config, now).ok, true);
  const blocked = consumeApiKeyRateLimit("k1", config, now);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.retryAfterSec >= 1, true);
    assert.equal(blocked.remaining, 0);
  }
  // Other keys unaffected
  assert.equal(consumeApiKeyRateLimit("k2", config, now).ok, true);
  // Window reset
  assert.equal(
    consumeApiKeyRateLimit("k1", config, now + 60_001).ok,
    true,
  );
});

test("disabled config never blocks", () => {
  resetApiKeyRateLimitForTests();
  const config = { enabled: false, rpm: 1, windowMs: 60_000 };
  assert.equal(consumeApiKeyRateLimit("k", config, 0).ok, true);
  assert.equal(consumeApiKeyRateLimit("k", config, 0).ok, true);
});

function stubAuth(partial: Partial<AuthContext>): AuthContext {
  return {
    kind: "api_key",
    userId: "u1",
    clerkUserId: null,
    apiKeyId: "key-1",
    contactId: null,
    workspaceId: "ws-1",
    membershipRole: null,
    scopes: [],
    ...partial,
  };
}

test("apiKeyRateLimit middleware returns 429 with Retry-After", async () => {
  resetApiKeyRateLimitForTests();
  setApiKeyRateLimitConfigForTests({
    enabled: true,
    rpm: 1,
    windowMs: 60_000,
  });

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", stubAuth({ apiKeyId: "rate-mid-1" }));
    await next();
  });
  app.use("*", apiKeyRateLimit);
  app.get("/api/v1/projects", (c) => c.json({ ok: true }));

  assert.equal((await app.request("/api/v1/projects")).status, 200);
  const blocked = await app.request("/api/v1/projects");
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get("Retry-After"));
  assert.deepEqual(await blocked.json(), {
    error: "Rate limit exceeded",
    code: "rate_limited",
  });

  resetApiKeyRateLimitForTests();
});

test("apiKeyRateLimit middleware skips local_shell", async () => {
  resetApiKeyRateLimitForTests();
  setApiKeyRateLimitConfigForTests({
    enabled: true,
    rpm: 1,
    windowMs: 60_000,
  });

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", stubAuth({ kind: "local_shell", apiKeyId: null }));
    await next();
  });
  app.use("*", apiKeyRateLimit);
  app.get("/api/v1/projects", (c) => c.json({ ok: true }));

  assert.equal((await app.request("/api/v1/projects")).status, 200);
  assert.equal((await app.request("/api/v1/projects")).status, 200);

  resetApiKeyRateLimitForTests();
});
