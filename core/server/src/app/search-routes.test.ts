import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";

import type { AuthContext } from "../middleware/auth.js";

// search-routes transitively imports DB clients; set DATABASE_URL before load
// so module init succeeds. Handlers under test use stubs and never query.
process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const { handleMergedSearch, registerSearchRoutes } = await import("./search-routes.js");

const authWithSearch: AuthContext = {
  kind: "api_key",
  userId: null,
  clerkUserId: null,
  apiKeyId: "key-1",
  contactId: null,
  workspaceId: "ws-1",
  membershipRole: null,
  scopes: ["search:query"],
};

const authNoScope: AuthContext = {
  ...authWithSearch,
  scopes: ["tasks:read"],
};

test("OS-73 search routes are registered (real request, not 404)", async () => {
  const app = new Hono();
  registerSearchRoutes(app);
  const search = await app.request("/api/v1/search?q=x");
  const globalSearch = await app.request("/api/v1/global-search?q=x");
  assert.equal(search.status, 401);
  assert.equal(globalSearch.status, 401);
});

test("OS-73 /search uses agent profile and /global-search uses palette", async () => {
  const calls: Array<"agent" | "palette"> = [];
  const stubs = {
    globalSearch: async () => {
      calls.push("palette");
      return [{ id: "palette-1", kind: "task", title: "Palette hit" }];
    },
    runAgentSearch: async () => {
      calls.push("agent");
      return {
        results: [{ id: "agent-1", type: "task", title: "Agent hit" }],
        nextCursor: null,
      };
    },
  };

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", authWithSearch);
    await next();
  });
  registerSearchRoutes(app, stubs);

  const agentRes = await app.request("/api/v1/search?q=hello&type=task");
  assert.equal(agentRes.status, 200);
  const agentBody = (await agentRes.json()) as { results: unknown[] };
  assert.equal(agentBody.results.length, 1);

  const paletteRes = await app.request("/api/v1/global-search?q=hello");
  assert.equal(paletteRes.status, 200);
  const paletteBody = (await paletteRes.json()) as { results: unknown[] };
  assert.equal(paletteBody.results.length, 1);

  assert.deepEqual(calls, ["agent", "palette"]);
});

test("OS-73 search unification: missing search:query scope is forbidden", async () => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", authNoScope);
    await next();
  });
  app.get("/api/v1/search", (c) =>
    handleMergedSearch(c, "agent", {
      runAgentSearch: async () => {
        throw new Error("should not run");
      },
    }),
  );

  const res = await app.request("/api/v1/search?q=hello");
  assert.equal(res.status, 403);
});
