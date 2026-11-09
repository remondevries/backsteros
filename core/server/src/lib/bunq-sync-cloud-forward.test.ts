import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  BunqSyncCloudForwardError,
  forwardBunqSyncToCloud,
  shouldForwardBunqSyncToCloud,
} from "./bunq-sync-cloud-forward.js";

const PREV = {
  role: process.env.CORE_REPLICATION_ROLE,
  peer: process.env.CORE_REPLICATION_PEER_URL,
  secret: process.env.CORE_REPLICATION_SECRET,
};

function apply(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  apply("CORE_REPLICATION_ROLE", PREV.role);
  apply("CORE_REPLICATION_PEER_URL", PREV.peer);
  apply("CORE_REPLICATION_SECRET", PREV.secret);
});

describe("shouldForwardBunqSyncToCloud", () => {
  it("is true for hybrid local-core even before peer config is checked", () => {
    apply("CORE_REPLICATION_ROLE", "local");
    assert.equal(shouldForwardBunqSyncToCloud(), true);
  });

  it("is false for cloud and standalone", () => {
    apply("CORE_REPLICATION_ROLE", "cloud");
    assert.equal(shouldForwardBunqSyncToCloud(), false);

    apply("CORE_REPLICATION_ROLE", undefined);
    assert.equal(shouldForwardBunqSyncToCloud(), false);
  });
});

describe("forwardBunqSyncToCloud", () => {
  it("POSTs workspace + bank account to the cloud internal route with replication auth", async () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");

    let hit: { url: string; auth: string | null; body: string } | null = null;
    const result = await forwardBunqSyncToCloud({
      workspaceId: "ws_1",
      bankAccountId: "ba_bunq",
      fetchImpl: (async (input, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        hit = {
          url: String(input),
          auth: headers?.Authorization ?? null,
          body: String(init?.body ?? ""),
        };
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              bankAccountId: "ba_bunq",
              fetched: 3,
              inserted: 1,
              duplicates: 2,
              monetaryAccountCount: 2,
              lastSyncedAt: "2026-11-09T21:00:00.000Z",
              // must be stripped by sanitizer if present
              apiKey: "should-never-leak",
              sessionToken: "should-never-leak",
            }),
        } as Response;
      }) as typeof fetch,
    });

    assert.ok(hit);
    assert.equal(
      hit.url,
      "http://127.0.0.1:3999/internal/core-replication/bunq-sync",
    );
    assert.equal(hit.auth, "Bearer test-secret");
    const body = JSON.parse(hit.body) as {
      workspace_id: string;
      bank_account_id: string;
    };
    assert.equal(body.workspace_id, "ws_1");
    assert.equal(body.bank_account_id, "ba_bunq");
    assert.deepEqual(result, {
      bankAccountId: "ba_bunq",
      fetched: 3,
      inserted: 1,
      duplicates: 2,
      monetaryAccountCount: 2,
      lastSyncedAt: "2026-11-09T21:00:00.000Z",
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(result, "apiKey"),
      false,
    );
  });

  it("propagates cloud auth rejection without credentials", async () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");

    await assert.rejects(
      () =>
        forwardBunqSyncToCloud({
          workspaceId: "ws_1",
          bankAccountId: "ba_bunq",
          fetchImpl: (async () =>
            ({
              ok: false,
              status: 400,
              text: async () =>
                JSON.stringify({
                  error:
                    "bunq rejected the API key or egress IP. Update the key or permitted IPs in Settings → bunq, then reconnect. Cached transactions stay available until sync succeeds.",
                  code: "bunq_auth_rejected",
                  apiKey: "sk_should_not_matter",
                }),
            }) as Response) as typeof fetch,
        }),
      (error: unknown) =>
        error instanceof BunqSyncCloudForwardError &&
        error.code === "bunq_auth_rejected" &&
        error.status === 400 &&
        /Settings → bunq/i.test(error.message) &&
        !error.message.includes("sk_"),
    );
  });

  it("fails clearly when cloud is unreachable (no local bunq fallback)", async () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", "http://127.0.0.1:3999");
    apply("CORE_REPLICATION_SECRET", "test-secret");

    await assert.rejects(
      () =>
        forwardBunqSyncToCloud({
          workspaceId: "ws_1",
          bankAccountId: "ba_bunq",
          fetchImpl: (async () => {
            throw new Error("connect ECONNREFUSED");
          }) as typeof fetch,
        }),
      (error: unknown) =>
        error instanceof BunqSyncCloudForwardError &&
        error.code === "bunq_sync_cloud_unavailable" &&
        /ECONNREFUSED|Cloud-core bunq sync/i.test(error.message),
    );
  });

  it("fails when local role lacks peer config (no bunq call)", async () => {
    apply("CORE_REPLICATION_ROLE", "local");
    apply("CORE_REPLICATION_PEER_URL", undefined);
    apply("CORE_REPLICATION_SECRET", undefined);

    await assert.rejects(
      () =>
        forwardBunqSyncToCloud({
          workspaceId: "ws_1",
          bankAccountId: "ba_bunq",
          fetchImpl: (async () => {
            throw new Error("fetch should not run");
          }) as typeof fetch,
        }),
      (error: unknown) =>
        error instanceof BunqSyncCloudForwardError &&
        error.code === "bunq_sync_cloud_unavailable",
    );
  });
});
