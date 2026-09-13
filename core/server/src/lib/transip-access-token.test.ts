import assert from "node:assert/strict";
import { describe, it } from "node:test";
import crypto from "node:crypto";

import {
  createTransipAccessToken,
  createTransipAuthSignature,
  isTransipAccessTokenFresh,
  normalizeTransipPrivateKey,
  readJwtExpiryMs,
} from "./transip-access-token.js";

function generateTestKeyPem(): string {
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

describe("normalizeTransipPrivateKey", () => {
  it("accepts a compacted PEM paste", () => {
    const pem = generateTestKeyPem();
    const compacted = pem.replace(/\n/g, " ");
    const normalized = normalizeTransipPrivateKey(compacted);
    assert.match(normalized, /BEGIN PRIVATE KEY/);
    assert.match(normalized, /END PRIVATE KEY/);
  });
});

describe("createTransipAuthSignature", () => {
  it("produces a base64 signature", () => {
    const pem = generateTestKeyPem();
    const signature = createTransipAuthSignature('{"login":"x"}', pem);
    assert.ok(signature.length > 20);
    assert.equal(Buffer.from(signature, "base64").toString("base64"), signature);
  });
});

describe("readJwtExpiryMs / isTransipAccessTokenFresh", () => {
  it("reads exp from an unverified JWT payload", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
    const token = `hdr.${payload}.sig`;
    assert.equal(readJwtExpiryMs(token), exp * 1000);
  });

  it("treats tokens within skew as stale", () => {
    const soon = Date.now() + 60_000;
    assert.equal(isTransipAccessTokenFresh(soon, Date.now(), 120_000), false);
    const later = Date.now() + 3 * 24 * 60 * 60 * 1000;
    assert.equal(isTransipAccessTokenFresh(later, Date.now(), 120_000), true);
  });
});

describe("createTransipAccessToken", () => {
  it("POSTs a signed auth body and returns the token", async () => {
    const pem = generateTestKeyPem();
    let sawSignature = false;
    const fetchImpl: typeof fetch = async (_url, init) => {
      const headers = new Headers(init?.headers);
      sawSignature = Boolean(headers.get("Signature"));
      const exp = Math.floor(Date.now() / 1000) + 86400;
      const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
      return new Response(JSON.stringify({ token: `a.${payload}.c` }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await createTransipAccessToken({
      login: "demo",
      privateKey: pem,
      fetchImpl,
    });
    assert.equal(sawSignature, true);
    assert.ok(result.token.startsWith("a."));
    assert.ok(result.expiresAt instanceof Date);
  });
});
