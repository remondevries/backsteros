import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_LOCAL_SHELL_TOKEN,
  describeLocalShellTokenStatus,
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

  it("keeps a test-only default bearer token under test runners", () => {
    const testEnv = { NODE_ENV: "test" };
    assert.equal(getLocalShellToken(testEnv), DEFAULT_LOCAL_SHELL_TOKEN);
    assert.equal(isLocalShellBearerToken("local", testEnv), true);
    assert.equal(isLocalShellBearerToken("nope", testEnv), false);
    assert.equal(
      getLocalShellToken({ BACKSTEROS_INTEGRATION_TEST: "1" }),
      DEFAULT_LOCAL_SHELL_TOKEN,
    );
  });

  it("has NO default token outside tests: unset LOCAL_SHELL_TOKEN rejects 'local'", () => {
    assert.equal(getLocalShellToken({}), null);
    assert.equal(getLocalShellToken({ LOCAL_SHELL_TOKEN: "   " }), null);
    assert.equal(isLocalShellBearerToken("local", {}), false);
    assert.equal(isLocalShellBearerToken("", {}), false);
    assert.match(describeLocalShellTokenStatus({}) ?? "", /LOCAL_SHELL_TOKEN is not set/);
    assert.equal(describeLocalShellTokenStatus({ LOCAL_SHELL_TOKEN: "x" }), null);
    assert.equal(describeLocalShellTokenStatus({ NODE_ENV: "test" }), null);
    assert.equal(describeLocalShellTokenStatus({ LOCAL_SHELL_AUTH: "0" }), null);
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
