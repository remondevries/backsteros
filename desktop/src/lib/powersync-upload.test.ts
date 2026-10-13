import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { AbstractPowerSyncDatabase } from "@powersync/web";

import { BacksterPowerSyncConnector } from "./powersync.ts";

const originalFetch = globalThis.fetch;

function pendingProjectBatch() {
  let completed = false;
  const database = {
    getCrudBatch: async () => ({
      crud: [
        {
          clientId: 1,
          op: "PUT" as const,
          table: "projects",
          id: "abc",
          opData: { name: "Queued" },
        },
      ],
      complete: async () => {
        completed = true;
      },
    }),
  } as unknown as AbstractPowerSyncDatabase;
  return {
    database,
    completed: () => completed,
  };
}

describe("PowerSync upload auth", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends the local-shell bearer and completes the batch", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("Authorization") ?? "");
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const pending = pendingProjectBatch();
    const connector = new BacksterPowerSyncConnector(
      "http://127.0.0.1:8788",
      async () => "local",
      "device-1",
    );
    await connector.uploadData(pending.database);

    assert.deepEqual(seen, ["Bearer local"]);
    assert.equal(pending.completed(), true);
  });

  it("does not call the API when the session token is missing", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const connector = new BacksterPowerSyncConnector(
      "http://127.0.0.1:8788",
      async () => null,
      "device-1",
    );
    await assert.rejects(
      () => connector.uploadData(pendingProjectBatch().database),
      /Missing session for upload/,
    );
    assert.equal(called, false);
  });
});
