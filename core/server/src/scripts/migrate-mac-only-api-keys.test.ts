import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DYNAMIC_ISLAND_API_KEY_NAME } from "../lib/dynamic-island-local-key-format.js";
import {
  parseMigrateMacOnlyApiKeysArgs,
  planMacOnlyApiKeyMigration,
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
});
