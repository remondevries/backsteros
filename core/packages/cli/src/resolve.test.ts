import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
  it("defaults to local core auth", () => {
    const prevUrl = process.env.BACKSTEROS_API_URL;
    const prevKey = process.env.BACKSTEROS_API_KEY;
    delete process.env.BACKSTEROS_API_URL;
    delete process.env.BACKSTEROS_API_KEY;
    // Point at a missing env file so this test stays hermetic.
    const prevEnvPath = process.env.BACKSTEROS_CLI_ENV;
    process.env.BACKSTEROS_CLI_ENV = "/tmp/backsteros-cli-missing.env";
    try {
      const config = loadConfig({});
      assert.equal(config.baseUrl, "http://127.0.0.1:8788");
      assert.equal(config.token, "local");
      assert.equal(config.activityActor, "agent");
    } finally {
      if (prevUrl === undefined) delete process.env.BACKSTEROS_API_URL;
      else process.env.BACKSTEROS_API_URL = prevUrl;
      if (prevKey === undefined) delete process.env.BACKSTEROS_API_KEY;
      else process.env.BACKSTEROS_API_KEY = prevKey;
      if (prevEnvPath === undefined) delete process.env.BACKSTEROS_CLI_ENV;
      else process.env.BACKSTEROS_CLI_ENV = prevEnvPath;
    }
  });
});
