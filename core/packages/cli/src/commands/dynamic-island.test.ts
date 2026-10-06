import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import type { CliClient, CliConfig } from "../config.js";
import { runDynamicIslandCommand } from "./dynamic-island.js";

function baseConfig(baseUrl: string): CliConfig {
  return {
    baseUrl,
    token: "local",
    activityActor: "agent",
    agentContactId: null,
    json: true,
  };
}

describe("runDynamicIslandCommand", () => {
  const previousHome = process.env.BACKSTEROS_DYNAMIC_ISLAND_HOME;
  const home = mkdtempSync(join(tmpdir(), "os88-island-pair-"));

  after(() => {
    if (previousHome === undefined) {
      delete process.env.BACKSTEROS_DYNAMIC_ISLAND_HOME;
    } else {
      process.env.BACKSTEROS_DYNAMIC_ISLAND_HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
  });

  it("rejects non-loopback URLs before calling the client", async () => {
    let called = false;
    const client = {
      requestJson: async () => {
        called = true;
        throw new Error("request must not run");
      },
    } as unknown as CliClient;

    for (const baseUrl of [
      "https://agent.backsteros.com",
      "http://192.168.1.10:8788",
      "http://127.0.0.1.evil.test",
      "http://127.0.0.1@evil.test",
    ]) {
      called = false;
      await assert.rejects(
        () => runDynamicIslandCommand(client, baseConfig(baseUrl), "pair"),
        /local core/,
      );
      assert.equal(called, false, `request should not run for ${baseUrl}`);
    }
  });

  it("pairs against loopback and writes the validated origin unchanged", async () => {
    process.env.BACKSTEROS_DYNAMIC_ISLAND_HOME = home;
    let called = false;
    const client = {
      requestJson: async () => {
        called = true;
        return {
          apiKey: {
            id: "key-1",
            name: "dynamic-island",
            prefix: "sk_live_testxxxx",
            scopes: ["tasks:read", "projects:read"],
          },
          secret: "sk_live_test_secret_not_for_logs",
        };
      },
    } as unknown as CliClient;

    const apiUrl = "http://127.0.0.1:8788";
    await runDynamicIslandCommand(client, baseConfig(apiUrl), "pair");
    assert.equal(called, true);
    const raw = readFileSync(
      join(home, ".config/dynamic-island/backsteros.env"),
      "utf8",
    );
    assert.match(raw, new RegExp(`^BACKSTEROS_API_URL=${apiUrl}$`, "m"));
  });
});
