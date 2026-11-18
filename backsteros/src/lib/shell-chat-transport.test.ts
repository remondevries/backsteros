import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  isShellChatLocalCoreOptIn,
  shellChatUsesLocalCore,
} from "./shell-chat-transport.ts";

const FLAG = "VITE_SHELL_CHAT_USE_LOCAL_CORE";

const previousFlag = process.env[FLAG];

afterEach(() => {
  if (previousFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previousFlag;
});

describe("shellChatUsesLocalCore (OS-192)", () => {
  it("uses cloud transport for production loopback apiUrl (no opt-in)", () => {
    delete process.env[FLAG];
    assert.equal(isShellChatLocalCoreOptIn(), false);
    assert.equal(shellChatUsesLocalCore("http://127.0.0.1:8788"), false);
    assert.equal(shellChatUsesLocalCore("http://localhost:8788"), false);
  });

  it("uses cloud transport for cloud / gateway apiUrl even with opt-in", () => {
    process.env[FLAG] = "1";
    assert.equal(
      shellChatUsesLocalCore("https://api.local.backsteros.com"),
      false,
    );
    assert.equal(
      shellChatUsesLocalCore("https://agent.backsteros.com"),
      false,
    );
  });

  it("uses local-core only for explicit OS-167 sim/preview opt-in + local API", () => {
    process.env[FLAG] = "1";
    assert.equal(isShellChatLocalCoreOptIn(), true);
    assert.equal(shellChatUsesLocalCore("http://127.0.0.1:8788"), true);
    assert.equal(shellChatUsesLocalCore("http://localhost:8800"), true);

    process.env[FLAG] = "true";
    assert.equal(shellChatUsesLocalCore("http://127.0.0.1:8788"), true);

    process.env[FLAG] = "yes";
    assert.equal(shellChatUsesLocalCore("http://127.0.0.1:8788"), true);
  });

  it("ignores non-truthy opt-in values", () => {
    process.env[FLAG] = "0";
    assert.equal(shellChatUsesLocalCore("http://127.0.0.1:8788"), false);
    process.env[FLAG] = "false";
    assert.equal(shellChatUsesLocalCore("http://127.0.0.1:8788"), false);
  });
});
