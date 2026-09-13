import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapTransipDomain,
  buildDomainProjectSummary,
  TransipClient,
} from "./transip-client.js";

describe("mapTransipDomain", () => {
  it("normalizes name and keeps metadata", () => {
    const mapped = mapTransipDomain({
      name: "Example.COM",
      status: "registered",
      registrationDate: "2016-01-01",
      renewalDate: "2026-01-01",
      isDnsOnly: false,
      tags: ["prod"],
    });
    assert.deepEqual(mapped, {
      name: "example.com",
      status: "registered",
      registrationDate: "2016-01-01",
      renewalDate: "2026-01-01",
      isDnsOnly: false,
      tags: ["prod"],
    });
  });

  it("returns null without a name", () => {
    assert.equal(mapTransipDomain({ status: "registered" }), null);
  });
});

describe("TransipClient.listDomains", () => {
  it("pages until a short batch", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("page=1")) {
        return new Response(
          JSON.stringify({
            domains: Array.from({ length: 100 }, (_, i) => ({
              name: `d${i}.com`,
              status: "registered",
            })),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          domains: [{ name: "last.com", status: "registered" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const client = new TransipClient({
      accessToken: "token",
      fetchImpl,
    });
    const domains = await client.listDomains();
    assert.equal(domains.length, 101);
    assert.equal(calls.length, 2);
    assert.equal(domains.at(-1)?.name, "last.com");
  });

  it("maps auth failures", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    const client = new TransipClient({ accessToken: "bad", fetchImpl });
    await assert.rejects(() => client.listDomains(), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: string }).code, "transip_auth_failed");
      return true;
    });
  });
});

describe("buildDomainProjectSummary", () => {
  it("includes status and renewal", () => {
    assert.equal(
      buildDomainProjectSummary({
        name: "example.com",
        status: "registered",
        registrationDate: "2016-01-01",
        renewalDate: "2026-01-01",
        isDnsOnly: false,
        tags: [],
      }),
      "TransIP domain · status registered · renews 2026-01-01 · registered 2016-01-01",
    );
  });
});
