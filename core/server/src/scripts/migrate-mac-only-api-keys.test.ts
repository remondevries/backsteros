import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DYNAMIC_ISLAND_API_KEY_NAME } from "../lib/dynamic-island-local-key-format.js";
import {
  filterMacOnlyKeys,
  parseMigrateMacOnlyApiKeysArgs,
  planMacOnlyApiKeyMigration,
  writeMigratedApiKeySecretFile,
  type MacOnlyKeySummary,
} from "./migrate-mac-only-api-keys.js";

describe("migrate-mac-only-api-keys (OS-181)", () => {
  it("parses dry-run and per-key confirm flags", () => {
    assert.deepEqual(parseMigrateMacOnlyApiKeysArgs([]), {
      apply: false,
      confirmKeyIds: [],
    });
    assert.deepEqual(
      parseMigrateMacOnlyApiKeysArgs([
        "--apply",
        "--confirm-key",
        "abc",
        "--confirm-key",
        "def",
      ]),
      { apply: true, confirmKeyIds: ["abc", "def"] },
    );
  });

  it("dry-run lists keys and skips Dynamic Island; apply only mints confirmed ids", () => {
    const rows: MacOnlyKeySummary[] = [
      {
        id: "k1",
        name: "BacksterDEV CLI",
        prefix: "sk_live_aaaa",
        workspaceId: "ws",
        scopes: ["tasks:write"],
        contactId: null,
      },
      {
        id: "island",
        name: DYNAMIC_ISLAND_API_KEY_NAME,
        prefix: "sk_live_bbbb",
        workspaceId: "ws",
        scopes: ["tasks:read"],
        contactId: null,
      },
    ];
    const dry = planMacOnlyApiKeyMigration(rows, {
      apply: false,
      confirmKeyIds: [],
    });
    assert.equal(dry.listed.length, 1);
    assert.equal(dry.toMint.length, 0);
    assert.equal(dry.skippedIsland, 1);

    const apply = planMacOnlyApiKeyMigration(rows, {
      apply: true,
      confirmKeyIds: ["k1"],
    });
    assert.deepEqual(
      apply.toMint.map((row) => row.id),
      ["k1"],
    );
  });

  it("filters out keys already present on the cloud", () => {
    const rows: MacOnlyKeySummary[] = [
      {
        id: "mac-only",
        name: "CLI",
        prefix: "sk_live_aaaa",
        workspaceId: "ws",
        scopes: ["tasks:write"],
        contactId: null,
      },
      {
        id: "already-cloud",
        name: "Cloud key",
        prefix: "sk_live_bbbb",
        workspaceId: "ws",
        scopes: ["tasks:write"],
        contactId: null,
      },
    ];
    const filtered = filterMacOnlyKeys(rows, new Set(["already-cloud"]));
    assert.deepEqual(
      filtered.map((row) => row.id),
      ["mac-only"],
    );
  });

  it("writes the one-time secret to a 0600 path without returning the value in logs", async () => {
    const writes: { path: string; mode?: number }[] = [];
    const chmods: { path: string; mode: number }[] = [];
    const path = await writeMigratedApiKeySecretFile({
      cloudKeyId: "cloud-key-1",
      secret: "sk_live_never_log_this",
      mkdirImpl: async () => undefined as unknown as string,
      writeFileImpl: async (p, _data, opts) => {
        writes.push({
          path: String(p),
          mode: typeof opts === "object" && opts ? (opts as { mode?: number }).mode : undefined,
        });
      },
      chmodImpl: async (p, mode) => {
        chmods.push({ path: String(p), mode });
      },
    });
    assert.match(path, /migrated-api-keys\/cloud-key-1\.secret$/);
    assert.equal(writes[0]?.mode, 0o600);
    assert.equal(chmods[0]?.mode, 0o600);
    assert.ok(!path.includes("sk_live"));
  });
});
