import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  DEFAULT_BACKSTEROS_API_URL,
  isBacksterosApiProxyUrl,
  normalizePersistedBacksterosApiUrl,
} from "./backsterosApiProxy";

describe("isBacksterosApiProxyUrl", () => {
  it("treats the local sentinel as proxy-eligible", () => {
    assert.equal(isBacksterosApiProxyUrl("http://127.0.0.1:8788"), true);
    assert.equal(isBacksterosApiProxyUrl("http://localhost:8788/"), true);
  });

  it("treats the Mac HTTPS gateway as proxy-eligible", () => {
    assert.equal(isBacksterosApiProxyUrl("https://api.local.backsteros.com"), true);
    assert.equal(isBacksterosApiProxyUrl("https://api.local.backsteros.com/"), true);
  });

  it("rejects unrelated hosts", () => {
    assert.equal(isBacksterosApiProxyUrl("https://example.com"), false);
    assert.equal(isBacksterosApiProxyUrl("http://127.0.0.1:3000"), false);
  });
});

describe("normalizePersistedBacksterosApiUrl", () => {
  it("rewrites the gateway to the local proxy sentinel", () => {
    assert.equal(
      normalizePersistedBacksterosApiUrl("https://api.local.backsteros.com"),
      DEFAULT_BACKSTEROS_API_URL,
    );
  });

  it("keeps an explicit local sentinel", () => {
    assert.equal(
      normalizePersistedBacksterosApiUrl("http://127.0.0.1:8788"),
      "http://127.0.0.1:8788",
    );
  });
});
