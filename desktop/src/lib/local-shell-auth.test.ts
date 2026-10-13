import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLOUD_OWNER_USER_ID,
  LOCAL_SHELL_USER_ID,
  createDesktopTokenProvider,
} from "./local-shell-auth.ts";

describe("desktop owner auth", () => {
  it("does not fall back to Bearer local", async () => {
    const provider = createDesktopTokenProvider();
    const token = await provider();
    assert.notEqual(token, "local");
    assert.ok(token == null || token.startsWith("sk_live_"));
  });

  it("uses a cloud SQLite key distinct from the replica shell", () => {
    assert.equal(CLOUD_OWNER_USER_ID, "cloud_owner");
    assert.notEqual(CLOUD_OWNER_USER_ID, LOCAL_SHELL_USER_ID);
  });
});
