import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ZernioApiError, ZernioClient } from "./client.js";
import { clearZernioRequestGates, rateTierForAccountCount } from "./request-gate.js";

describe("zernio rate tiers", () => {
  it("maps account counts to documented limits", () => {
    assert.deepEqual(rateTierForAccountCount(0), {
      generalPerMinute: 60,
      analyticsPerSecond: 6,
      tier: "small",
    });
    assert.deepEqual(rateTierForAccountCount(2), {
      generalPerMinute: 60,
      analyticsPerSecond: 6,
      tier: "small",
    });
    assert.deepEqual(rateTierForAccountCount(3), {
      generalPerMinute: 600,
      analyticsPerSecond: 10,
      tier: "medium",
    });
    assert.deepEqual(rateTierForAccountCount(2001), {
      generalPerMinute: 1200,
      analyticsPerSecond: 20,
      tier: "large",
    });
  });
});

describe("ZernioClient", () => {
  it("retries on 429 then succeeds", async () => {
    clearZernioRequestGates();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = new ZernioClient({
      apiKey: "test-key",
      rateKey: "retry-test",
      fetchImpl,
      maxRetries: 2,
    });
    const result = await client.verify();
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
  });

  it("maps 412 to reconnect guidance", async () => {
    clearZernioRequestGates();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ code: "missing_scope" }), { status: 412 });
    const client = new ZernioClient({
      apiKey: "test-key",
      rateKey: "412-test",
      fetchImpl,
      maxRetries: 0,
    });
    await assert.rejects(
      () => client.verify(),
      (error: unknown) => {
        assert.ok(error instanceof ZernioApiError);
        assert.equal(error.status, 412);
        assert.match(error.message, /reconnect/i);
        return true;
      },
    );
  });

  it("lists accounts from mocked payload", async () => {
    clearZernioRequestGates();
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          accounts: [
            {
              _id: "a1",
              platform: "twitter",
              username: "remon",
              status: "active",
            },
            {
              id: "a2",
              platform: "linkedin",
              accountType: "organization",
              username: "backsteros",
            },
          ],
        }),
        { status: 200 },
      );
    const client = new ZernioClient({
      apiKey: "test-key",
      rateKey: "accounts-test",
      fetchImpl,
    });
    const accounts = await client.listAccounts();
    assert.equal(accounts.length, 2);
    assert.equal(accounts[0]!.id, "a1");
    assert.equal(accounts[0]!.platform, "twitter");
    assert.equal(accounts[1]!.accountType, "organization");
  });
});
