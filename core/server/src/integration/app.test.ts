import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq, inArray } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import { apiKeys, users, workspaces } from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

async function json(
  app: ReturnType<typeof createApp>,
  path: string,
  token?: string,
  init: RequestInit = {},
) {
  const response = await app.request(path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  return { response, body: await response.json() as Record<string, unknown> };
}

test("API enforces auth, scopes, workspace isolation, and domain contracts", async (context) => {
  const app = createApp();
  const userIds = [id("user"), id("user")];
  const workspaceIds = [id("workspace"), id("workspace")];
  const fullSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const otherSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const readSecret = `sk_live_${randomUUID().replaceAll("-", "")}`;

  context.after(async () => {
    await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await sqlClient.end();
  });

  await db.insert(users).values([
    { id: userIds[0]!, clerkId: id("clerk"), email: "one@example.test" },
    { id: userIds[1]!, clerkId: id("clerk"), email: "two@example.test" },
  ]);
  await db.insert(workspaces).values([
    { id: workspaceIds[0]!, name: "One", slug: id("one"), ownerUserId: userIds[0] },
    { id: workspaceIds[1]!, name: "Two", slug: id("two"), ownerUserId: userIds[1] },
  ]);
  await db.insert(apiKeys).values([
    {
      id: id("key"),
      workspaceId: workspaceIds[0]!,
      userId: userIds[0]!,
      name: "integration",
      prefix: apiKeyLookupPrefix(fullSecret),
      keyHash: hashApiKey(fullSecret),
      scopes: [...API_KEY_SCOPES],
    },
    {
      id: id("key"),
      workspaceId: workspaceIds[1]!,
      userId: userIds[1]!,
      name: "isolated",
      prefix: apiKeyLookupPrefix(otherSecret),
      keyHash: hashApiKey(otherSecret),
      scopes: [...API_KEY_SCOPES],
    },
    {
      id: id("key"),
      workspaceId: workspaceIds[0]!,
      userId: userIds[0]!,
      name: "read-only",
      prefix: apiKeyLookupPrefix(readSecret),
      keyHash: hashApiKey(readSecret),
      scopes: ["projects:read"],
    },
  ]);

  const health = await json(app, "/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(typeof health.body.spacesConfigured, "boolean");

  const unauthorized = await json(app, "/api/v1/projects");
  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.body.code, "unauthorized");

  const forbidden = await json(app, "/api/v1/projects", readSecret, {
    method: "POST",
    body: JSON.stringify({ key: "blocked", name: "Blocked" }),
  });
  assert.equal(forbidden.response.status, 403);

  const project = await json(app, "/api/v1/projects", fullSecret, {
    method: "POST",
    body: JSON.stringify({ key: "integration", name: "Integration project", status: "active" }),
  });
  assert.equal(project.response.status, 201);
  assert.equal(project.body.name, "Integration project");
  const projectId = String(project.body.id);

  const task = await json(app, "/api/v1/tasks", fullSecret, {
    method: "POST",
    body: JSON.stringify({ projectId, title: "Contract task", inbox: true }),
  });
  assert.equal(task.response.status, 201);
  assert.equal(task.body.projectId, projectId);
  assert.equal(task.body.inbox, true);

  const organization = await json(app, "/api/v1/organizations", fullSecret, {
    method: "POST",
    body: JSON.stringify({ key: "ORG", name: "Contract organization" }),
  });
  assert.equal(organization.response.status, 201);
  assert.equal(organization.body.key, "ORG");

  const letter = await json(app, "/api/v1/letters", fullSecret, {
    method: "POST",
    body: JSON.stringify({
      title: "Contract letter",
      organizationId: organization.body.id,
      direction: "incoming",
    }),
  });
  assert.equal(letter.response.status, 201);
  assert.equal(letter.body.title, "Contract letter");

  const isolated = await json(app, "/api/v1/projects", otherSecret);
  assert.equal(isolated.response.status, 200);
  assert.deepEqual(isolated.body.projects, []);

  const visible = await json(app, "/api/v1/projects", fullSecret);
  assert.equal(visible.response.status, 200);
  assert.equal((visible.body.projects as unknown[]).length, 1);
});

test("CORS admits the production app origin", async () => {
  const previous = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = "https://backsteros.com";
  const response = await createApp().request("/health", {
    headers: { origin: "https://backsteros.com" },
  });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://backsteros.com");
  if (previous === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = previous;
});
