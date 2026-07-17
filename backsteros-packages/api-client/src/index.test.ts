import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiClientError,
  createApiClient,
  createClerkTokenProvider,
} from "./index.js";

test("awaits the token provider and authenticates contract requests", async () => {
  let requestedAuthorization: string | null = null;
  const client = createApiClient({
    baseUrl: "https://api.example.test/",
    getToken: async () => {
      await Promise.resolve();
      return "session-token";
    },
    fetch: async (_input, init) => {
      requestedAuthorization = new Headers(init?.headers).get("authorization");
      return Response.json({ projects: [] });
    },
  });

  const response = await client.contract.listProjects({ query: {} });

  assert.equal(response.status, 200);
  assert.equal(requestedAuthorization, "Bearer session-token");
});

test("does not send an authorization header when no token is available", async () => {
  let requestedAuthorization: string | null = "not-observed";
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    getToken: async () => null,
    fetch: async (_input, init) => {
      requestedAuthorization = new Headers(init?.headers).get("authorization");
      return Response.json({ settings: {} });
    },
  });

  await client.getPowerSyncCredentials().catch(() => undefined);

  assert.equal(requestedAuthorization, null);
});

test("throws a structured error for non-2xx JSON responses", async () => {
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    getToken: () => "secret-that-must-not-appear",
    fetch: async () =>
      Response.json(
        { error: "Insufficient scope", code: "forbidden" },
        { status: 403 },
      ),
  });

  await assert.rejects(
    () => client.contract.listProjects({ query: {} }),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 403);
      assert.equal(error.code, "forbidden");
      assert.equal(error.message, "Insufficient scope");
      assert.doesNotMatch(String(error), /secret-that-must-not-appear/);
      return true;
    },
  );
});

test("serializes typed JSON requests and preserves route headers", async () => {
  let observed: { contentType: string | null; body: string } | null = null;
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (_input, init) => {
      observed = {
        contentType: new Headers(init?.headers).get("content-type"),
        body: String(init?.body),
      };
      return Response.json(
        {
          id: "task-1",
          projectId: null,
          contactId: null,
          assigneeId: null,
          number: 1,
          title: "Typed request",
          description: null,
          status: "ready_to_start",
          priority: 0,
          sortOrder: 0,
          dueDate: null,
          triagedAt: null,
          inbox: true,
          completedAt: null,
          createdAt: "2026-07-16T12:00:00.000Z",
          updatedAt: "2026-07-16T12:00:00.000Z",
          deletedAt: null,
        },
        { status: 201 },
      );
    },
  });

  await client.contract.createTask({ body: { title: "Typed request" } });

  assert.deepEqual(observed, {
    contentType: "application/json",
    body: JSON.stringify({ title: "Typed request" }),
  });
});

test("adapts Clerk's async getToken function", async () => {
  let observedTemplate: string | undefined;
  const getToken = async (options?: { template?: string }) => {
    observedTemplate = options?.template;
    return "clerk-token";
  };
  const provider = createClerkTokenProvider(getToken, { template: "backsteros-api" });

  assert.equal(await provider(), "clerk-token");
  assert.equal(observedTemplate, "backsteros-api");
});

test("returns blobs for binary responses", async () => {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async () =>
      new Response(bytes, { headers: { "content-type": "application/pdf" } }),
  });

  const result = await client.downloadLetterPdf("letter/id");

  assert.ok(result instanceof Blob);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
});

test("returns blobs for image responses even without a Content-Type", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async () => new Response(bytes),
  });

  const result = await client.downloadAvatar("contact", "contact-1");

  assert.ok(result instanceof Blob);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
});

test("PowerSync writes use JSON and the current token", async () => {
  let observed: { authorization: string | null; contentType: string | null; body: string } | null =
    null;
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    getToken: () => Promise.resolve("fresh-token"),
    fetch: async (_input, init) => {
      const headers = new Headers(init?.headers);
      observed = {
        authorization: headers.get("authorization"),
        contentType: headers.get("content-type"),
        body: String(init?.body),
      };
      return Response.json({ ok: true });
    },
  });

  await client.writePowerSync({
    device_id: "browser",
    batch: [{ table: "tasks", op: "DELETE", id: "task-1" }],
  });

  assert.deepEqual(observed, {
    authorization: "Bearer fresh-token",
    contentType: "application/json",
    body: JSON.stringify({
      device_id: "browser",
      batch: [{ table: "tasks", op: "DELETE", id: "task-1" }],
    }),
  });
});
