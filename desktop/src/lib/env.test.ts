import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOUD_CORE_API_URL,
  CLOUD_SYNC_URL,
  LOCAL_CORE_API_URL,
  isLocalDevApiUrl,
  resolveDesktopApiUrl,
  rewritePowerSyncEndpoint,
  sseUrlForApiUrl,
} from "./env.ts";

test("product API defaults to local-core", () => {
  assert.equal(resolveDesktopApiUrl(undefined), LOCAL_CORE_API_URL);
  assert.equal(resolveDesktopApiUrl(""), "http://127.0.0.1:8788");
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

test("cleartext PowerSync stays loopback for local-core API", () => {
  assert.equal(
    rewritePowerSyncEndpoint("http://127.0.0.1:8080", {
      apiUrl: LOCAL_CORE_API_URL,
    }),
    "http://127.0.0.1:8080",
  );
  assert.equal(
    rewritePowerSyncEndpoint("http://100.75.45.22:8080", {
      apiUrl: CLOUD_CORE_API_URL,
    }),
    CLOUD_SYNC_URL,
  );
  assert.equal(
    rewritePowerSyncEndpoint("http://127.0.0.1:8080", {
      apiUrl: CLOUD_CORE_API_URL,
    }),
    CLOUD_SYNC_URL,
  );
  assert.equal(
    rewritePowerSyncEndpoint("https://sync.local.backsteros.com"),
    "https://sync.local.backsteros.com",
  );
});

test("optional replica API keeps loopback PowerSync and SSE on one host", () => {
  assert.equal(isLocalDevApiUrl("http://127.0.0.1:8788"), true);
  assert.equal(isLocalDevApiUrl("http://localhost:8788"), true);
  assert.equal(isLocalDevApiUrl("http://localhost:1420"), false);
  assert.equal(isLocalDevApiUrl("https://api.local.backsteros.com"), false);
  assert.equal(
    rewritePowerSyncEndpoint("http://127.0.0.1:8080", {
      apiUrl: "http://127.0.0.1:8788",
    }),
    "http://127.0.0.1:8080",
  );
  assert.equal(
    sseUrlForApiUrl("http://127.0.0.1:8788"),
    "http://127.0.0.1:8788",
  );
  assert.equal(
    sseUrlForApiUrl("https://api.local.backsteros.com"),
    "https://sse.local.backsteros.com",
  );
});
