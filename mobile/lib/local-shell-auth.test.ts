import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOCAL_SHELL_USER_ID,
  createTokenProvider,
  resolveLocalShellBearerToken,
} from "./local-shell-token.ts";

describe("mobile local-shell-auth", () => {
  it("has no default token: missing/empty config sends no Bearer", async () => {
    assert.equal(resolveLocalShellBearerToken({}), null);
    assert.equal(resolveLocalShellBearerToken({ configured: "" }), null);
    assert.equal(resolveLocalShellBearerToken({ configured: "   " }), null);
    const provider = createTokenProvider(() => resolveLocalShellBearerToken({}));
    assert.equal(await provider(), null);
  });

  it("uses the configured local-shell token", async () => {
    assert.equal(
      resolveLocalShellBearerToken({ configured: " my-shell-token " }),
      "my-shell-token",
    );
    const provider = createTokenProvider(() =>
      resolveLocalShellBearerToken({ configured: "tok" }),
    );
    assert.equal(await provider(), "tok");
  });

  it("falls back to a well-formed owner Access key only", () => {
    assert.equal(
      resolveLocalShellBearerToken({ ownerApiKey: "sk_access_abc123" }),
      "sk_access_abc123",
    );
    assert.equal(
      resolveLocalShellBearerToken({ ownerApiKey: "not-a-key" }),
      null,
    );
    assert.equal(
      resolveLocalShellBearerToken({
        configured: "shell",
        ownerApiKey: "sk_access_abc123",
      }),
      "shell",
    );
  });

  it("exposes a stable PowerSync user id", () => {
    assert.equal(LOCAL_SHELL_USER_ID, "local_shell");
  });
});
