import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { Hono } from "hono";

import type { AuthContext } from "../middleware/auth.js";
import type { DbClientEstimate } from "../db/schema.js";
import { clientEstimateRouteDeps } from "../services/finance/client-estimates.js";

// finance-routes transitively imports DB clients; set DATABASE_URL before load
// so module init succeeds. Handlers under test use stubs and never query.
process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const { registerFinanceRoutes } = await import("./finance-routes.js");

const ORG_ID = "org_afx";
const ESTIMATE_ID = "est_1";

const authOrgRead: AuthContext = {
  kind: "api_key",
  userId: null,
  clerkUserId: null,
  apiKeyId: "key-org-read",
  contactId: null,
  workspaceId: "ws_1",
  membershipRole: null,
  scopes: ["organizations:read"],
};

const authFinanceWrite: AuthContext = {
  ...authOrgRead,
  apiKeyId: "key-finance-write",
  scopes: ["finance:write"],
};

const authNeither: AuthContext = {
  ...authOrgRead,
  apiKeyId: "key-tasks",
  scopes: ["tasks:read"],
};

function sampleRow(
  overrides: Partial<DbClientEstimate> = {},
): DbClientEstimate {
  const now = new Date("2026-10-07T12:00:00.000Z");
  return {
    id: ESTIMATE_ID,
    workspaceId: "ws_1",
    organizationId: ORG_ID,
    projectId: null,
    title: "AF proposal",
    subtitle: null,
    clientLabel: "AFX",
    authorName: "Remon",
    versionLabel: "v1",
    documentDate: "oktober 2026",
    status: "published",
    proposalMarkdown: "# Proposal",
    estimateMarkdown: "## Estimate",
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

afterEach(() => {
  mock.restoreAll();
});

function appWithAuth(auth: AuthContext) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", auth);
    await next();
  });
  registerFinanceRoutes(app);
  return app;
}

describe("LDP-20 /api/v1/finance/estimates", () => {
  it("lists estimates scoped by organizationId with organizations:read", async () => {
    const listCalls: unknown[] = [];
    mock.method(
      clientEstimateRouteDeps,
      "listClientEstimates",
      async (workspaceId: string, query: { organizationId?: string }) => {
        listCalls.push({ workspaceId, query });
        return [sampleRow()];
      },
    );

    const app = appWithAuth(authOrgRead);
    const res = await app.request(
      `/api/v1/finance/estimates?organizationId=${ORG_ID}`,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      estimates: Array<{ id: string; organizationId: string | null }>;
    };
    assert.equal(body.estimates.length, 1);
    assert.equal(body.estimates[0]?.id, ESTIMATE_ID);
    assert.equal(body.estimates[0]?.organizationId, ORG_ID);
    assert.deepEqual(listCalls, [
      { workspaceId: "ws_1", query: { organizationId: ORG_ID } },
    ]);
  });

  it("gets an estimate with organizations:read", async () => {
    mock.method(
      clientEstimateRouteDeps,
      "getClientEstimateById",
      async (workspaceId: string, id: string) => {
        assert.equal(workspaceId, "ws_1");
        assert.equal(id, ESTIMATE_ID);
        return sampleRow();
      },
    );

    const app = appWithAuth(authOrgRead);
    const res = await app.request(`/api/v1/finance/estimates/${ESTIMATE_ID}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      id: string;
      organizationId: string | null;
      title: string;
    };
    assert.equal(body.id, ESTIMATE_ID);
    assert.equal(body.organizationId, ORG_ID);
    assert.equal(body.title, "AF proposal");
  });

  it("rejects create without finance:write (organizations:read alone)", async () => {
    mock.method(clientEstimateRouteDeps, "createClientEstimate", async () => {
      throw new Error("should not create");
    });

    const app = appWithAuth(authOrgRead);
    const res = await app.request("/api/v1/finance/estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: ORG_ID,
        title: "New estimate",
      }),
    });
    assert.equal(res.status, 403);
  });

  it("creates an estimate when key has finance:write", async () => {
    mock.method(
      clientEstimateRouteDeps,
      "createClientEstimate",
      async (
        workspaceId: string,
        input: { organizationId?: string; title: string },
      ) => {
        assert.equal(workspaceId, "ws_1");
        assert.equal(input.organizationId, ORG_ID);
        assert.equal(input.title, "New estimate");
        return sampleRow({
          id: "est_new",
          title: input.title,
          status: "draft",
          proposalMarkdown: "",
          estimateMarkdown: "",
        });
      },
    );

    const app = appWithAuth(authFinanceWrite);
    const res = await app.request("/api/v1/finance/estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: ORG_ID,
        title: "New estimate",
      }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { id: string; title: string };
    assert.equal(body.id, "est_new");
    assert.equal(body.title, "New estimate");
  });

  it("forbids list without organizations:read or finance:read", async () => {
    mock.method(clientEstimateRouteDeps, "listClientEstimates", async () => {
      throw new Error("should not list");
    });

    const app = appWithAuth(authNeither);
    const res = await app.request("/api/v1/finance/estimates");
    assert.equal(res.status, 403);
  });
});
