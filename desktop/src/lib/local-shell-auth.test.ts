import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_LOCAL_SHELL_TOKEN,
  LOCAL_SHELL_USER_ID,
  createDesktopTokenProvider,
  desktopPowerSyncUserId,
} from "./local-shell-auth.ts";

describe("desktop local-shell-auth", () => {
  it("uses local bearer when signed out", async () => {
    const provider = createDesktopTokenProvider(async () => "clerk-jwt", false);
    assert.equal(await provider(), DEFAULT_LOCAL_SHELL_TOKEN);
  });

  it("prefers Clerk JWT when signed in", async () => {
    const provider = createDesktopTokenProvider(async () => "clerk-jwt", true);
    assert.equal(await provider(), "clerk-jwt");
  });

  it("falls back to local when Clerk getToken fails", async () => {
    const provider = createDesktopTokenProvider(async () => {
      throw new Error("clerk down");
    }, true);
    assert.equal(await provider(), DEFAULT_LOCAL_SHELL_TOKEN);
  });

  it("keys PowerSync with a stable local id", () => {
    assert.equal(desktopPowerSyncUserId(null), LOCAL_SHELL_USER_ID);
    assert.equal(desktopPowerSyncUserId("user_abc"), "user_abc");
  });
});
