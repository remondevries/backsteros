import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
  getLogLevel,
  isLogLevelEnabled,
  logger,
  parseLogLevel,
  setLogLevel,
} from "./logger.js";

describe("logger", () => {
  const initial = getLogLevel();
  afterEach(() => {
    setLogLevel(initial);
    mock.restoreAll();
  });

  it("parses LOG_LEVEL with an info fallback", () => {
    assert.equal(parseLogLevel("WARN"), "warn");
    assert.equal(parseLogLevel(" debug "), "debug");
    assert.equal(parseLogLevel("silent"), "silent");
    assert.equal(parseLogLevel("verbose"), "info");
    assert.equal(parseLogLevel(undefined), "info");
  });

  it("gates levels below the threshold", () => {
    setLogLevel("warn");
    assert.equal(isLogLevelEnabled("info"), false);
    assert.equal(isLogLevelEnabled("warn"), true);
    assert.equal(isLogLevelEnabled("error"), true);
    setLogLevel("silent");
    assert.equal(isLogLevelEnabled("error"), false);
  });

  it("only writes enabled levels to the console", () => {
    const log = mock.method(console, "log", () => {});
    const warn = mock.method(console, "warn", () => {});
    setLogLevel("warn");
    logger.info("hidden");
    logger.warn("shown");
    assert.equal(log.mock.callCount(), 0);
    assert.deepEqual(warn.mock.calls[0]?.arguments, ["shown"]);
  });
});
