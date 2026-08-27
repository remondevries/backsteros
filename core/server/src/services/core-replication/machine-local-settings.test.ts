import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeWorkspaceSettingsForRole,
  sanitizeWorkspaceSettingsRowForReplication,
  stripMachineLocalSettingsFields,
} from "./machine-local-settings.js";

describe("machine-local settings", () => {
  it("strips vaultPath from outbound settings", () => {
    assert.deepEqual(
      stripMachineLocalSettingsFields({
        theme: "dark",
        vaultPath: "/Users/remon/BacksterOS",
      }),
      { theme: "dark" },
    );
  });

  it("strips vaultPath from workspace_settings replication rows", () => {
    const row = sanitizeWorkspaceSettingsRowForReplication({
      workspace_id: "ws1",
      settings: { vaultPath: "/Users/remon/BacksterOS", locale: "nl" },
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    assert.deepEqual(row.settings, { locale: "nl" });
  });

  it("cloud apply uses env vaultPath only, never peer Mac path", () => {
    const merged = mergeWorkspaceSettingsForRole(
      { theme: "light", vaultPath: "/Users/remon/BacksterOS" },
      { vaultPath: "/old" },
      "cloud",
      { BACKSTEROS_VAULT_PATH: "/data/vault" },
    );
    assert.equal(merged.vaultPath, "/data/vault");
    assert.equal(merged.theme, "light");
  });

  it("local apply preserves existing vaultPath and ignores peer", () => {
    const merged = mergeWorkspaceSettingsForRole(
      { theme: "light", vaultPath: "/data/vault" },
      { vaultPath: "/Users/remon/BacksterOS", theme: "dark" },
      "local",
      {},
    );
    assert.equal(merged.vaultPath, "/Users/remon/BacksterOS");
    assert.equal(merged.theme, "light");
  });

  it("cloud without env leaves vaultPath unset", () => {
    const merged = mergeWorkspaceSettingsForRole(
      { vaultPath: "/Users/remon/BacksterOS" },
      null,
      "cloud",
      {},
    );
    assert.equal("vaultPath" in merged, false);
  });
});
