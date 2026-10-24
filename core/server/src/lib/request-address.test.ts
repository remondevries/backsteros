import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTrustedProxyRemoteAddress } from "./request-address.js";

describe("isTrustedProxyRemoteAddress", () => {
  it("trusts loopback peers by default", () => {
    assert.equal(isTrustedProxyRemoteAddress("127.0.0.1"), true);
    assert.equal(isTrustedProxyRemoteAddress("::1"), true);
    assert.equal(isTrustedProxyRemoteAddress("::ffff:127.0.0.1"), true);
  });

  it("rejects arbitrary clients", () => {
    assert.equal(isTrustedProxyRemoteAddress("203.0.113.50"), false);
    assert.equal(isTrustedProxyRemoteAddress(null), false);
    assert.equal(isTrustedProxyRemoteAddress(""), false);
  });

  it("trusts extras from TRUSTED_PROXY_IPS", () => {
    const env = { TRUSTED_PROXY_IPS: "10.0.0.2, 192.0.2.10" };
    assert.equal(isTrustedProxyRemoteAddress("10.0.0.2", env), true);
    assert.equal(isTrustedProxyRemoteAddress("192.0.2.10", env), true);
    assert.equal(isTrustedProxyRemoteAddress("10.0.0.3", env), false);
  });
});
