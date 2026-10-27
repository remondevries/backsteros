import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { probeDesktopOwnerAccess } from "./desktop-owner-access.ts";

describe("probeDesktopOwnerAccess", () => {
  it("denies when no token is present", async () => {
    const result = await probeDesktopOwnerAccess({
      apiUrl: "http://127.0.0.1:8788",
      getToken: async () => null,
      fetch: async () => {
        throw new Error("fetch should not run");
      },
    });
    assert.equal(result, "denied");
  });

  it("denies on 401", async () => {
    const result = await probeDesktopOwnerAccess({
      apiUrl: "http://127.0.0.1:8788",
      getToken: async () => "local",
      fetch: async () =>
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
    });
    assert.equal(result, "denied");
  });

  it("denies on 403", async () => {
    const result = await probeDesktopOwnerAccess({
      apiUrl: "http://127.0.0.1:8788",
      getToken: async () => "local",
      fetch: async () => new Response("{}", { status: 403 }),
    });
    assert.equal(result, "denied");
  });

  it("allows local-shell bearer when local-core settings returns 200", async () => {
    const result = await probeDesktopOwnerAccess({
      apiUrl: "http://127.0.0.1:8788/",
      getToken: async () => "local",
      fetch: async (input, init) => {
        assert.equal(String(input), "http://127.0.0.1:8788/api/v1/settings");
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          "Bearer local",
        );
        return new Response("{}", { status: 200 });
      },
    });
    assert.equal(result, "ok");
  });

  it("requires owner key format on cloud API URLs", async () => {
    const result = await probeDesktopOwnerAccess({
      apiUrl: "https://api.local.backsteros.com",
      getToken: async () => "local",
      fetch: async () => {
        throw new Error("fetch should not run");
      },
    });
    assert.equal(result, "denied");
  });

  it("allows when cloud settings returns 200 with owner key", async () => {
    const result = await probeDesktopOwnerAccess({
      apiUrl: "https://api.local.backsteros.com",
      getToken: async () => "sk_access_test",
      fetch: async () => new Response("{}", { status: 200 }),
    });
    assert.equal(result, "ok");
  });

  it("allows through on network failure so offline UI still opens", async () => {
    const result = await probeDesktopOwnerAccess({
      apiUrl: "http://127.0.0.1:8788",
      getToken: async () => "local",
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    assert.equal(result, "ok");
  });
});
