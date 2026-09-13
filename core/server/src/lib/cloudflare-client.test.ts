import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CloudflareClient } from "./cloudflare-client.js";

describe("CloudflareClient", () => {
  it("lists zones via the official SDK pagination", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = new CloudflareClient({ apiToken: "test-token" });
    // Replace SDK client with a stubbed async iterator.
    (client as unknown as { client: { zones: { list: () => AsyncGenerator } } }).client = {
      zones: {
        async *list(query?: Record<string, unknown>) {
          calls.push(query ?? {});
          yield { id: "zone1", name: "example.com", status: "active" };
          yield { id: "zone2", name: "other.nl", status: "active" };
          yield { id: "", name: "skip.me", status: "active" };
        },
      },
    };

    const zones = await client.listZones();
    assert.deepEqual(zones, [
      { id: "zone1", name: "example.com", status: "active" },
      { id: "zone2", name: "other.nl", status: "active" },
    ]);
    assert.equal(calls.length, 1);
  });

  it("lists and sorts DNS records", async () => {
    const client = new CloudflareClient({ apiToken: "test-token" });
    (client as unknown as {
      client: {
        dns: { records: { list: (q: { zone_id: string }) => AsyncGenerator } };
      };
    }).client = {
      dns: {
        records: {
          async *list(query: { zone_id: string }) {
            assert.equal(query.zone_id, "zone1");
            yield {
              id: "r2",
              type: "A",
              name: "www.example.com",
              content: "1.2.3.4",
              ttl: 1,
              proxied: true,
            };
            yield {
              id: "r1",
              type: "CNAME",
              name: "example.com",
              content: "target.example.net",
              ttl: 300,
              proxied: false,
            };
          },
        },
      },
    };

    const records = await client.listDnsRecords("zone1");
    assert.deepEqual(
      records.map((entry) => entry.id),
      ["r1", "r2"],
    );
  });

  it("purges everything for a zone", async () => {
    const client = new CloudflareClient({ apiToken: "test-token" });
    let purgeArgs: unknown = null;
    (client as unknown as {
      client: {
        cache: {
          purge: (params: unknown) => Promise<{ id: string }>;
        };
      };
    }).client = {
      cache: {
        purge: async (params) => {
          purgeArgs = params;
          return { id: "purge-1" };
        },
      },
    };

    const result = await client.purgeEverything("zone1");
    assert.deepEqual(purgeArgs, {
      zone_id: "zone1",
      purge_everything: true,
    });
    assert.deepEqual(result, { id: "purge-1" });
  });
});
