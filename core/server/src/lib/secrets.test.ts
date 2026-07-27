import assert from "node:assert/strict";
import { test } from "node:test";

import { assertPowerSyncSecrets } from "./secrets.js";

test("assertPowerSyncSecrets allows empty config outside production", () => {
  assert.doesNotThrow(() =>
    assertPowerSyncSecrets({
      NODE_ENV: "development",
    }),
  );
});

test("assertPowerSyncSecrets rejects missing secret when PowerSync URL is set", () => {
  assert.throws(
    () =>
      assertPowerSyncSecrets({
        NODE_ENV: "development",
        POWERSYNC_URL: "http://localhost:8080",
      }),
    /POWERSYNC_JWT_SECRET is required/,
  );
});

test("assertPowerSyncSecrets rejects example secret when PowerSync URL is set", () => {
  assert.throws(
    () =>
      assertPowerSyncSecrets({
        NODE_ENV: "development",
        POWERSYNC_URL: "http://localhost:8080",
        POWERSYNC_JWT_SECRET: "dev-powersync-secret-change-me",
      }),
    /must not be the example value/,
  );
});

test("assertPowerSyncSecrets rejects short secrets in production", () => {
  assert.throws(
    () =>
      assertPowerSyncSecrets({
        NODE_ENV: "production",
        POWERSYNC_JWT_SECRET: "short-but-not-example",
      }),
    /at least 32 characters/,
  );
});

test("assertPowerSyncSecrets accepts a strong production secret", () => {
  assert.doesNotThrow(() =>
    assertPowerSyncSecrets({
      NODE_ENV: "production",
      POWERSYNC_JWT_SECRET: "a".repeat(32),
    }),
  );
});
