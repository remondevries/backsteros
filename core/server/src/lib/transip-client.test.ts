import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapTransipDomain,
  buildDomainProjectSummary,
  buildTransipDomainProjectIcon,
  isTransipDomainCancelledLike,
  parseTransipDomainTagsFromIcon,
  projectDateToYmd,
  transipYmdToIso,
  TransipClient,
} from "./transip-client.js";

describe("mapTransipDomain", () => {
  it("normalizes name and keeps metadata", () => {
    const mapped = mapTransipDomain({
      name: "Example.COM",
      status: "registered",
      cancellationStatus: null,
      cancellationDate: null,
      registrationDate: "2016-01-01",
      renewalDate: "2026-01-01",
      isDnsOnly: false,
      tags: ["prod"],
    });
    assert.deepEqual(mapped, {
      name: "example.com",
      status: "registered",
      cancellationStatus: null,
      cancellationDate: null,
      registrationDate: "2016-01-01",
      renewalDate: "2026-01-01",
      isDnsOnly: false,
      tags: ["prod"],
    });
  });

  it("maps cancellation fields", () => {
    const mapped = mapTransipDomain({
      name: "bye.nl",
      status: "registered",
      cancellationStatus: "cancelled",
      cancellationDate: "2026-06-01",
    });
    assert.equal(mapped?.cancellationStatus, "cancelled");
    assert.equal(mapped?.cancellationDate, "2026-06-01");
    assert.equal(isTransipDomainCancelledLike(mapped!), true);
  });

  it("returns null without a name", () => {
    assert.equal(mapTransipDomain({ status: "registered" }), null);
  });
});

describe("isTransipDomainCancelledLike", () => {
  it("treats cancellationStatus as cancelled even when status is registered", () => {
    assert.equal(
      isTransipDomainCancelledLike({
        status: "registered",
        cancellationStatus: "cancelled",
      }),
      true,
    );
    assert.equal(
      isTransipDomainCancelledLike({
        status: "registered",
        cancellationStatus: null,
      }),
      false,
    );
    assert.equal(isTransipDomainCancelledLike({ status: "gone" }), true);
  });
});
describe("transipYmdToIso / projectDateToYmd", () => {
  it("converts purchase dates for project storage", () => {
    assert.equal(transipYmdToIso("2016-01-01"), "2016-01-01T00:00:00.000Z");
    assert.equal(transipYmdToIso("bad"), null);
    assert.equal(projectDateToYmd("2016-01-01T00:00:00.000Z"), "2016-01-01");
    assert.equal(projectDateToYmd(new Date("2016-01-01T00:00:00.000Z")), "2016-01-01");
  });
});

describe("buildTransipDomainProjectIcon", () => {
  it("embeds tags for Catalog list labels", () => {
    const icon = buildTransipDomainProjectIcon(["prod", "client"]);
    assert.deepEqual(parseTransipDomainTagsFromIcon(icon), ["prod", "client"]);
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
    assert.ok(calls[0]?.includes("include=goneDomains"));
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

describe("TransipClient.updateDomainTags", () => {
  it("PUTs the full domain with replaced tags", async () => {
    const calls: Array<{ url: string; method: string; body: string | null }> =
      [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string"
          ? init.body
          : init?.body == null
            ? null
            : String(init.body);
      calls.push({ url, method, body });
      if (method === "GET") {
        return new Response(
          JSON.stringify({
            domain: {
              name: "example.com",
              status: "registered",
              tags: ["old"],
              isDnsOnly: false,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(null, { status: 204 });
    };

    const client = new TransipClient({
      accessToken: "token",
      fetchImpl,
    });
    const tags = await client.updateDomainTags("Example.COM", ["prod", " client "]);
    assert.deepEqual(tags, ["prod", "client"]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.method, "PUT");
    assert.ok(calls[1]?.url.includes("/domains/example.com"));
    const putBody = JSON.parse(calls[1]!.body!) as {
      domain: { tags: string[] };
    };
    assert.deepEqual(putBody.domain.tags, ["prod", "client"]);
  });
});

describe("buildDomainProjectSummary", () => {
  it("includes status and renewal", () => {
    assert.equal(
      buildDomainProjectSummary({
        name: "example.com",
        status: "registered",
        cancellationStatus: null,
        cancellationDate: null,
        registrationDate: "2016-01-01",
        renewalDate: "2026-01-01",
        isDnsOnly: false,
        tags: [],
      }),
      "TransIP domain · status registered · renews 2026-01-01 · registered 2016-01-01",
    );
  });
});
