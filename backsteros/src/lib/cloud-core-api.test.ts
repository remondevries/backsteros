import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CLOUD_CORE_PUBLIC_API_URL,
  CLOUD_CORE_VITE_PROXY_PREFIX,
  cloudCoreApiBaseUrl,
} from "./cloud-core-api.ts";

test("cloudCoreApiBaseUrl uses Vite proxy on :1420 in DEV", () => {
  assert.equal(
    cloudCoreApiBaseUrl({
      viteDev: true,
      pageOrigin: "http://localhost:1420",
    }),
    `http://localhost:1420${CLOUD_CORE_VITE_PROXY_PREFIX}`,
  );
  assert.equal(
    cloudCoreApiBaseUrl({
      viteDev: true,
      pageOrigin: "http://127.0.0.1:1420",
    }),
    `http://127.0.0.1:1420${CLOUD_CORE_VITE_PROXY_PREFIX}`,
  );
});

test("cloudCoreApiBaseUrl uses public door outside Vite UI", () => {
  assert.equal(
    cloudCoreApiBaseUrl({ viteDev: false, pageOrigin: "http://localhost:1420" }),
    CLOUD_CORE_PUBLIC_API_URL,
  );
  assert.equal(
    cloudCoreApiBaseUrl({ viteDev: true, pageOrigin: null }),
    CLOUD_CORE_PUBLIC_API_URL,
  );
});
