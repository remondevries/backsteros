import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatMobileApiNetworkError,
  isMobileApiNetworkError,
  normalizeCoreOrigin,
  resolveCoreApiUrl,
} from "./probe-core-health.ts";

describe("normalizeCoreOrigin", () => {
  it("strips /api/v1 suffix", () => {
    assert.equal(
      normalizeCoreOrigin("http://127.0.0.1:8788/api/v1"),
      "http://127.0.0.1:8788",
    );
  });
});

describe("resolveCoreApiUrl", () => {
  const local = "http://macbook.ts.net:8788";
  const cloud = "http://100.117.142.79:8788";

  it("prefers local when reachable", () => {
    assert.deepEqual(
      resolveCoreApiUrl({
        localReachable: true,
        cloudReachable: true,
        localApiUrl: local,
        cloudApiUrl: cloud,
      }),
      { activeApiUrl: local, coreMode: "local" },
    );
  });

  it("falls back to cloud when local is down", () => {
    assert.deepEqual(
      resolveCoreApiUrl({
        localReachable: false,
        cloudReachable: true,
        localApiUrl: local,
        cloudApiUrl: cloud,
      }),
      { activeApiUrl: cloud, coreMode: "cloud" },
    );
  });

  it("stays on local when both are down", () => {
    assert.deepEqual(
      resolveCoreApiUrl({
        localReachable: false,
        cloudReachable: false,
        localApiUrl: local,
        cloudApiUrl: cloud,
      }),
      { activeApiUrl: local, coreMode: "local" },
    );
  });

  it("ignores cloud when not configured", () => {
    assert.deepEqual(
      resolveCoreApiUrl({
        localReachable: false,
        cloudReachable: true,
        localApiUrl: local,
        cloudApiUrl: null,
      }),
      { activeApiUrl: local, coreMode: "local" },
    );
  });
});

describe("formatMobileApiNetworkError", () => {
  it("mentions cloud fallback when active", () => {
    assert.match(
      formatMobileApiNetworkError({
        activeApiUrl: "http://cloud:8788",
        localApiUrl: "http://local:8788",
        cloudApiUrl: "http://cloud:8788",
        coreMode: "cloud",
      }),
      /cloud/i,
    );
  });

  it("detects network errors", () => {
    assert.equal(isMobileApiNetworkError("Network request failed"), true);
    assert.equal(isMobileApiNetworkError("not_found"), false);
  });
});
