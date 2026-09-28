import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { parseDisplayId } from "./resolve.js";
import { parseCliArgv } from "./parse.js";
import { loadConfig } from "./config.js";

describe("parseDisplayId", () => {
  it("parses KEY-number", () => {
    assert.deepEqual(parseDisplayId("DOT-1"), {
      projectKey: "DOT",
      number: 1,
    });
    assert.deepEqual(parseDisplayId("ab-12"), {
      projectKey: "AB",
      number: 12,
    });
  });

  it("rejects bare ids", () => {
    assert.equal(parseDisplayId("Q3YjXLhMj4QstksFWyvIW"), null);
  });
});

describe("parseCliArgv", () => {
  it("parses task update with status flag", () => {
    const parsed = parseCliArgv([
      "task",
      "update",
      "DOT-1",
      "--status",
      "completed",
      "--json",
    ]);
    assert.equal(parsed.resource, "task");
    assert.equal(parsed.action, "update");
    assert.deepEqual(parsed.positionals, ["DOT-1"]);
    assert.equal(parsed.values.status, "completed");
    assert.equal(parsed.global.json, true);
  });
});

describe("loadConfig", () => {
  const envKeys = [
    "BACKSTEROS_API_URL",
    "BACKSTEROS_API_KEY",
    "BACKSTEROS_CLI_ENV",
    "BACKSTEROS_AGENT_CONTACT_ID",
    "BACKSTEROS_ACTIVITY_ACTOR",
    "LOCAL_SHELL_TOKEN",
    "HOME",
    "XDG_CONFIG_HOME",
  ] as const;

  let tempHome: string;
  const previous = new Map<string, string | undefined>();

  before(() => {
    tempHome = mkdtempSync(join(tmpdir(), "backsteros-cli-test-"));
    for (const key of envKeys) {
      previous.set(key, process.env[key]);
    }
    process.env.HOME = tempHome;
    process.env.XDG_CONFIG_HOME = join(tempHome, ".config");
    delete process.env.BACKSTEROS_API_URL;
    delete process.env.BACKSTEROS_API_KEY;
    delete process.env.BACKSTEROS_CLI_ENV;
    delete process.env.BACKSTEROS_AGENT_CONTACT_ID;
    delete process.env.BACKSTEROS_ACTIVITY_ACTOR;
    delete process.env.LOCAL_SHELL_TOKEN;
  });

  after(() => {
    for (const key of envKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("defaults to local core auth", () => {
    const config = loadConfig({});
    assert.equal(config.baseUrl, "http://127.0.0.1:8788");
    assert.equal(config.token, "local");
    assert.equal(config.activityActor, "agent");
    assert.equal(config.agentContactId, null);
  });
});
