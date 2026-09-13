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
});
