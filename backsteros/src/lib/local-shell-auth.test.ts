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

  it("uses local-shell bearer for Tailscale local-core when opted in", async () => {
    const previous = process.env.VITE_TREAT_API_AS_LOCAL_CORE;
    process.env.VITE_TREAT_API_AS_LOCAL_CORE = "1";
    try {
      const token = await loadDesktopProductToken("http://100.126.31.97:8788");
      assert.equal(token, DEFAULT_LOCAL_SHELL_TOKEN);
    } finally {
      if (previous === undefined) delete process.env.VITE_TREAT_API_AS_LOCAL_CORE;
      else process.env.VITE_TREAT_API_AS_LOCAL_CORE = previous;
    }
  });

  it("uses local-shell bearer for HTTPS gateway when opted in", async () => {
    const previousFlag = process.env.VITE_TREAT_API_AS_LOCAL_CORE;
    const previousHost = process.env.VITE_DEV_SERVER_HOST;
    process.env.VITE_TREAT_API_AS_LOCAL_CORE = "1";
    process.env.VITE_DEV_SERVER_HOST = "dev-os.lemo-design.com";
    try {
      const token = await loadDesktopProductToken(
        "https://dev-os.lemo-design.com",
      );
      assert.equal(token, DEFAULT_LOCAL_SHELL_TOKEN);
    } finally {
      if (previousFlag === undefined) delete process.env.VITE_TREAT_API_AS_LOCAL_CORE;
      else process.env.VITE_TREAT_API_AS_LOCAL_CORE = previousFlag;
      if (previousHost === undefined) delete process.env.VITE_DEV_SERVER_HOST;
      else process.env.VITE_DEV_SERVER_HOST = previousHost;
    }
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
