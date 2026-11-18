import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";

import type { AuthContext } from "../../middleware/auth.js";

// infra-routes transitively imports DB clients; set DATABASE_URL before load.
process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const { registerProjectInfraRoutes } = await import("./infra-routes.js");

const readOnlyKey: AuthContext = {
  kind: "api_key",
  userId: "user-1",
  clerkUserId: null,
  apiKeyId: "key-read",
  apiKeyName: "Read",
  contactId: null,
  workspaceId: "ws_1",
  membershipRole: null,
  scopes: ["projects:read"],
};

function assertNoStoreHeaders(response: Response) {
  assert.equal(response.headers.get("Cache-Control"), "no-store, private");
  assert.equal(response.headers.get("Pragma"), "no-cache");
}

function appWithAuth(auth: AuthContext | null) {
  const app = new Hono();
  if (auth) {
    app.use("*", async (c, next) => {
      c.set("auth", auth);
      await next();
    });
  }
  registerProjectInfraRoutes(app);
  return app;
}

describe("POST /api/v1/transip/domains/:domainName/auth-code cache headers", () => {
  it("sets no-store headers on every response (401 and 403)", async () => {
    const unauth = await appWithAuth(null).request(
      "/api/v1/transip/domains/example.com/auth-code",
      { method: "POST" },
    );
    assert.equal(unauth.status, 401);
    assertNoStoreHeaders(unauth);

    const forbidden = await appWithAuth(readOnlyKey).request(
      "/api/v1/transip/domains/example.com/auth-code",
      { method: "POST" },
    );
    assert.equal(forbidden.status, 403);
    assertNoStoreHeaders(forbidden);
  });
});
