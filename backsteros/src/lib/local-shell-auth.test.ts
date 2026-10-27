import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLOUD_OWNER_USER_ID,
  DEFAULT_LOCAL_SHELL_TOKEN,
  LOCAL_SHELL_USER_ID,
  createDesktopTokenProvider,
  loadDesktopProductToken,
} from "./local-shell-auth.ts";

describe("desktop product auth", () => {
  it("uses local-shell bearer against local-core", async () => {
    const token = await loadDesktopProductToken("http://127.0.0.1:8788");
    assert.equal(token, DEFAULT_LOCAL_SHELL_TOKEN);

    const provider = createDesktopTokenProvider("http://127.0.0.1:8788");
    assert.equal(await provider(), DEFAULT_LOCAL_SHELL_TOKEN);
  });

  it("does not invent a local-shell bearer for cloud API URLs", async () => {
    const token = await loadDesktopProductToken(
      "https://api.local.backsteros.com",
    );
    assert.notEqual(token, DEFAULT_LOCAL_SHELL_TOKEN);
    assert.ok(
      token == null ||
        token.startsWith("sk_access_") ||
        token.startsWith("sk_live_"),
    );
  });

  it("uses a cloud SQLite key distinct from the replica shell", () => {
    assert.equal(CLOUD_OWNER_USER_ID, "cloud_owner");
    assert.notEqual(CLOUD_OWNER_USER_ID, LOCAL_SHELL_USER_ID);
  });
});
