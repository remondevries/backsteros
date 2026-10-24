import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isTrustedProxyRemoteAddress,
  normalizeIpAddress,
} from "./request-address.js";

describe("normalizeIpAddress", () => {
  it("strips IPv4-mapped IPv6 prefixes", () => {
    assert.equal(normalizeIpAddress("::ffff:172.20.0.1"), "172.20.0.1");
    assert.equal(normalizeIpAddress("::FFFF:127.0.0.1"), "127.0.0.1");
  });

  it("trims and lower-cases", () => {
    assert.equal(normalizeIpAddress("  203.0.113.50  "), "203.0.113.50");
    assert.equal(normalizeIpAddress("::1"), "::1");
  });

  it("returns null for empty", () => {
    assert.equal(normalizeIpAddress(null), null);
    assert.equal(normalizeIpAddress(""), null);
    assert.equal(normalizeIpAddress("   "), null);
  });
});

describe("isTrustedProxyRemoteAddress", () => {
  it("trusts loopback peers by default (including IPv4-mapped)", () => {
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

  it("matches IPv4-mapped peers against plain IPv4 TRUSTED_PROXY_IPS", () => {
    const env = { TRUSTED_PROXY_IPS: "172.20.0.1" };
    assert.equal(isTrustedProxyRemoteAddress("172.20.0.1", env), true);
    assert.equal(isTrustedProxyRemoteAddress("::ffff:172.20.0.1", env), true);
    assert.equal(isTrustedProxyRemoteAddress("172.18.0.1", env), false);
  });
});
