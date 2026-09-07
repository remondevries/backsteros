import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_LOCAL_SHELL_TOKEN,
  getLocalShellToken,
  isLocalShellAuthEnabled,
  isLocalShellBearerToken,
} from "./local-shell-auth-config.js";

describe("local-shell-auth", () => {
  it("is enabled by default on local-core", () => {
    assert.equal(isLocalShellAuthEnabled({}), true);
    assert.equal(
      isLocalShellAuthEnabled({ CORE_REPLICATION_ROLE: "local" }),
      true,
    );
  });

  it("is disabled on cloud-core", () => {
    assert.equal(
      isLocalShellAuthEnabled({ CORE_REPLICATION_ROLE: "cloud" }),
      false,
    );
  });

  it("can be disabled explicitly", () => {
    assert.equal(isLocalShellAuthEnabled({ LOCAL_SHELL_AUTH: "0" }), false);
  });

  it("matches the default bearer token", () => {
    assert.equal(getLocalShellToken({}), DEFAULT_LOCAL_SHELL_TOKEN);
    assert.equal(isLocalShellBearerToken("local", {}), true);
    assert.equal(isLocalShellBearerToken("nope", {}), false);
  });

  it("respects LOCAL_SHELL_TOKEN", () => {
    assert.equal(
      getLocalShellToken({ LOCAL_SHELL_TOKEN: " secret " }),
      "secret",
    );
    assert.equal(
      isLocalShellBearerToken("secret", { LOCAL_SHELL_TOKEN: "secret" }),
      true,
    );
  });
});
