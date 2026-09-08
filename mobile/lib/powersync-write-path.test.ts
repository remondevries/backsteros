import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  shouldSkipRestAfterCrudFlush,
  shouldSkipRestEntityWrite,
  shouldWriteEntityViaPowerSync,
} from "./powersync-write-path.ts";

describe("powersync-write-path", () => {
  it("writes via PowerSync when local and ready", () => {
    const gate = { ready: true, connected: true, preferRestWrites: false };
    assert.equal(shouldWriteEntityViaPowerSync(gate), true);
    assert.equal(shouldSkipRestEntityWrite(gate), true);
  });

  it("forces REST when cloud fallback is active", () => {
    const gate = { ready: true, connected: true, preferRestWrites: true };
    assert.equal(shouldWriteEntityViaPowerSync(gate), false);
    assert.equal(shouldSkipRestEntityWrite(gate), false);
  });

  it("uses REST when PowerSync is disconnected", () => {
    const gate = { ready: true, connected: false, preferRestWrites: false };
    assert.equal(shouldWriteEntityViaPowerSync(gate), true);
    assert.equal(shouldSkipRestEntityWrite(gate), false);
  });

  it("skips REST after a successful CRUD flush", () => {
    assert.equal(shouldSkipRestAfterCrudFlush(true), true);
    assert.equal(shouldSkipRestAfterCrudFlush(undefined), true);
  });

  it("falls through to REST when CRUD flush uploaded nothing", () => {
    assert.equal(shouldSkipRestAfterCrudFlush(false), false);
  });
});
