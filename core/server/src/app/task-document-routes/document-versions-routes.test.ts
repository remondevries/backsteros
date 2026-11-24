import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { Hono } from "hono";

import type { AuthContext } from "../../middleware/auth.js";
import type { DocumentVersionRow } from "../../services/document-versions.js";
import { documentVersionRouteDeps } from "../../services/document-versions.js";

process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const { registerDocumentActivityRoutes } = await import(
  "./document-activity-routes.js"
);

const DOC_ID = "doc_1";
const authRead: AuthContext = {
  kind: "api_key",
  userId: null,
  clerkUserId: null,
  apiKeyId: "key-docs-read",
  contactId: null,
  workspaceId: "ws_1",
  membershipRole: null,
  scopes: ["documents:read"],
};

function sampleVersion(
  overrides: Partial<DocumentVersionRow> = {},
): DocumentVersionRow {
  const now = new Date("2026-11-24T12:00:00.000Z");
  return {
    id: "ver_3",
    workspaceId: "ws_1",
    documentId: DOC_ID,
    contentVersion: 3,
    content: "line a\nline b",
    actorKind: "user",
    actorUserId: "u1",
    actorContactId: null,
    actorName: "Remon",
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
  registerDocumentActivityRoutes(app);
  return app;
}

describe("GET /api/v1/documents/:id/versions/:contentVersion (OS-204)", () => {
  it("returns version + previous when withPrevious=1", async () => {
    mock.method(documentVersionRouteDeps, "getDocumentById", async () => ({
      id: DOC_ID,
      projectId: "proj_1",
    }));
    const current = sampleVersion();
    const previous = sampleVersion({
      id: "ver_2",
      contentVersion: 2,
      content: "line a",
    });
    mock.method(
      documentVersionRouteDeps,
      "getDocumentVersionWithPrevious",
      async (
        workspaceId: string,
        documentId: string,
        contentVersion: number,
      ) => {
        assert.equal(workspaceId, "ws_1");
        assert.equal(documentId, DOC_ID);
        assert.equal(contentVersion, 3);
        return { version: current, previous };
      },
    );

    const app = appWithAuth(authRead);
    const res = await app.request(
      `/api/v1/documents/${DOC_ID}/versions/3?withPrevious=1`,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      version: { contentVersion: number; content: string };
      previous: { contentVersion: number; content: string } | null;
    };
    assert.equal(body.version.contentVersion, 3);
    assert.equal(body.version.content, "line a\nline b");
    assert.equal(body.previous?.contentVersion, 2);
    assert.equal(body.previous?.content, "line a");
  });

  it("returns previous: null when no earlier version is stored", async () => {
    mock.method(documentVersionRouteDeps, "getDocumentById", async () => ({
      id: DOC_ID,
      projectId: null,
    }));
    mock.method(
      documentVersionRouteDeps,
      "getDocumentVersionWithPrevious",
      async () => ({
        version: sampleVersion({ contentVersion: 1 }),
        previous: null,
      }),
    );

    const app = appWithAuth(authRead);
    const res = await app.request(
      `/api/v1/documents/${DOC_ID}/versions/1?withPrevious=1`,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { previous: null };
    assert.equal(body.previous, null);
  });

  it("404s when the requested version row is missing", async () => {
    mock.method(documentVersionRouteDeps, "getDocumentById", async () => ({
      id: DOC_ID,
      projectId: null,
    }));
    mock.method(
      documentVersionRouteDeps,
      "getDocumentVersionWithPrevious",
      async () => ({ version: null, previous: null }),
    );

    const app = appWithAuth(authRead);
    const res = await app.request(
      `/api/v1/documents/${DOC_ID}/versions/9?withPrevious=1`,
    );
    assert.equal(res.status, 404);
  });
});
