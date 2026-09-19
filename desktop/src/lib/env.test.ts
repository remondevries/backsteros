import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOUD_CORE_API_URL,
  CLOUD_SYNC_URL,
  resolveDesktopApiUrl,
  rewritePowerSyncEndpoint,
} from "./env.ts";

test("product API defaults to the HTTPS gateway", () => {
  assert.equal(resolveDesktopApiUrl(undefined), CLOUD_CORE_API_URL);
  assert.equal(resolveDesktopApiUrl(""), "https://api.local.backsteros.com");
  assert.equal(
    resolveDesktopApiUrl("http://100.75.45.22:8788"),
    "https://api.local.backsteros.com",
  );
  assert.equal(
    resolveDesktopApiUrl("https://api.local.backsteros.com"),
    "https://api.local.backsteros.com",
  );
  assert.equal(
    resolveDesktopApiUrl("http://127.0.0.1:8788"),
    "http://127.0.0.1:8788",
  );
});

test("cleartext PowerSync becomes the HTTPS sync gateway", () => {
  assert.equal(
    rewritePowerSyncEndpoint("http://100.75.45.22:8080"),
    CLOUD_SYNC_URL,
  );
  assert.equal(
    rewritePowerSyncEndpoint("http://127.0.0.1:8080"),
    "https://sync.local.backsteros.com",
  );
  assert.equal(
    rewritePowerSyncEndpoint("https://sync.local.backsteros.com"),
    "https://sync.local.backsteros.com",
  );
});
