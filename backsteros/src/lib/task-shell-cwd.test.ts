import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  looksLikeLocalFilesystemPath,
  resolveTaskShellCwd,
} from "./task-shell-cwd.ts";

describe("looksLikeLocalFilesystemPath", () => {
  it("accepts absolute and home paths", () => {
    assert.equal(looksLikeLocalFilesystemPath("/Users/me/Code"), true);
    assert.equal(looksLikeLocalFilesystemPath("~/Code"), true);
    assert.equal(looksLikeLocalFilesystemPath("~"), true);
  });

  it("rejects host-style remote labels", () => {
    assert.equal(looksLikeLocalFilesystemPath("development"), false);
    assert.equal(looksLikeLocalFilesystemPath("server:22"), false);
  });
});

describe("resolveTaskShellCwd", () => {
  it("prefers local Development path", () => {
    assert.equal(
      resolveTaskShellCwd({
        development: { kind: "local", path: "/Users/me/Dev/app" },
        localWorkingDirectory: "/Users/me/Vault/app",
      }),
      "/Users/me/Dev/app",
    );
  });

  it("skips server Development and uses localWorkingDirectory", () => {
    assert.equal(
      resolveTaskShellCwd({
        development: {
          kind: "server",
          path: "/home/deploy/app",
          host: "development",
        },
        localWorkingDirectory: "/Users/me/Vault/app",
      }),
      "/Users/me/Vault/app",
    );
  });

  it("falls back through developmentLocation then localWorkingDirectory", () => {
    assert.equal(
      resolveTaskShellCwd({
        developmentLocation: "/Users/me/Legacy",
        localWorkingDirectory: "/Users/me/Vault",
      }),
      "/Users/me/Legacy",
    );
    assert.equal(
      resolveTaskShellCwd({
        developmentLocation: "development",
        localWorkingDirectory: "/Users/me/Vault",
      }),
      "/Users/me/Vault",
    );
  });

  it("returns null when nothing local is set (sidecar uses $HOME)", () => {
    assert.equal(resolveTaskShellCwd({}), null);
    assert.equal(resolveTaskShellCwd(null), null);
  });
});
