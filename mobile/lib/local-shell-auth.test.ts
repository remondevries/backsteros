import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_LOCAL_SHELL_TOKEN,
  LOCAL_SHELL_USER_ID,
  createMobileTokenProvider,
} from "./local-shell-auth.ts";

describe("mobile local-shell-auth", () => {
  it("returns the default local bearer", async () => {
    const provider = createMobileTokenProvider();
    assert.equal(await provider(), DEFAULT_LOCAL_SHELL_TOKEN);
  });

  it("exposes a stable PowerSync user id", () => {
    assert.equal(LOCAL_SHELL_USER_ID, "local_shell");
  });
});
