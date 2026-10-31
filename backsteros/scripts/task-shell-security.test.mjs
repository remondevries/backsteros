import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  isAllowedTaskShellOrigin,
  isTaskShellAuthConfigured,
  isTaskShellAuthorized,
  isTaskShellOriginAcceptable,
  resolveTaskShellCwd,
} from "./task-shell-security.mjs";

describe("isAllowedTaskShellOrigin", () => {
  it("allows localhost, 127.0.0.1, tauri, and *.localhost", () => {
    assert.equal(isAllowedTaskShellOrigin("http://localhost:1420"), true);
    assert.equal(isAllowedTaskShellOrigin("https://127.0.0.1:1420"), true);
    assert.equal(isAllowedTaskShellOrigin("tauri://localhost"), true);
    assert.equal(isAllowedTaskShellOrigin("http://app.localhost"), true);
  });

  it("rejects Expo public tunnel domains and arbitrary sites", () => {
    assert.equal(
      isAllowedTaskShellOrigin("https://u.exp.direct"),
      false,
    );
    assert.equal(
      isAllowedTaskShellOrigin("https://u.exp.host"),
      false,
    );
    assert.equal(isAllowedTaskShellOrigin("https://evil.example"), false);
    assert.equal(isAllowedTaskShellOrigin(""), false);
    assert.equal(isAllowedTaskShellOrigin(null), false);
  });
});

describe("task-shell auth fail-closed", () => {
  it("requires PTY_AUTH_TOKEN to be configured", () => {
    assert.equal(isTaskShellAuthConfigured(null), false);
    assert.equal(isTaskShellAuthConfigured(""), false);
    assert.equal(isTaskShellAuthConfigured("   "), false);
    assert.equal(isTaskShellAuthConfigured("secret"), true);
  });

  it("refuses when auth token is unset even if a bearer is sent", () => {
    assert.equal(isTaskShellAuthorized(null, "secret"), false);
    assert.equal(isTaskShellAuthorized("", "secret"), false);
  });

  it("requires an exact bearer match when configured", () => {
    assert.equal(isTaskShellAuthorized("secret", "secret"), true);
    assert.equal(isTaskShellAuthorized("secret", "other"), false);
    assert.equal(isTaskShellAuthorized("secret", null), false);
    assert.equal(isTaskShellAuthorized("secret", ""), false);
  });
});

describe("isTaskShellOriginAcceptable", () => {
  it("allows missing Origin; rejects exp tunnel origins", () => {
    assert.equal(isTaskShellOriginAcceptable(undefined), true);
    assert.equal(isTaskShellOriginAcceptable(""), true);
    assert.equal(isTaskShellOriginAcceptable("http://localhost:1420"), true);
    assert.equal(isTaskShellOriginAcceptable("https://u.exp.direct"), false);
  });
});

describe("resolveTaskShellCwd", () => {
  const pathApi = {
    homedir: () => os.homedir(),
    join: path.join,
    isAbsolute: path.isAbsolute,
  };

  it("allows absolute owner paths and home-relative paths (no chroot)", () => {
    assert.equal(
      resolveTaskShellCwd("/Users/me/Code", "/tmp/default", pathApi),
      "/Users/me/Code",
    );
    assert.equal(
      resolveTaskShellCwd("~", "/tmp/default", pathApi),
      os.homedir(),
    );
    assert.equal(
      resolveTaskShellCwd("~/Projects/app", "/tmp/default", pathApi),
      path.join(os.homedir(), "Projects/app"),
    );
  });

  it("falls back to default for relative or empty cwd", () => {
    assert.equal(
      resolveTaskShellCwd("relative/path", "/tmp/default", pathApi),
      "/tmp/default",
    );
    assert.equal(
      resolveTaskShellCwd(null, "/tmp/default", pathApi),
      "/tmp/default",
    );
  });
});
