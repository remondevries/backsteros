import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { AGENT_API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  organizations,
  projects,
  users,
  workspaces,
} from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import { LEGACY_LIST_HARD_CAP } from "../lib/list-query.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

async function json(
  app: ReturnType<typeof createApp>,
  path: string,
  token: string,
) {
  const response = await app.request(path, {
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    response,
    body: (await response.json()) as Record<string, unknown>,
    hint: response.headers.get("X-BacksterOS-Hint"),
  };
}

test("legacy GET /projects hard-caps at 200 with has_more", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const count = LEGACY_LIST_HARD_CAP + 1;

  context.after(async () => {
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(organizations).where(eq(organizations.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "legacy-cap@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Legacy cap",
    slug: id("legacy-cap"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "legacy-cap",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...AGENT_API_KEY_SCOPES],
  });

  // Keys are 2–3 chars; start at 36 so base36 is at least length 2 ("10").
  const keys: string[] = [];
  for (let i = 36; keys.length < count; i++) {
    const key = i.toString(36).toUpperCase();
    if (key.length > 3) break;
    keys.push(key);
  }
  assert.equal(keys.length, count);
  await db.insert(projects).values(
    keys.map((key, i) => ({
      id: id("project"),
      workspaceId,
      key,
      name: `Legacy project ${i}`,
      type: "general" as const,
      status: "active" as const,
      sortOrder: i,
    })),
  );

  const legacy = await json(app, "/api/v1/projects", secret);
  assert.equal(legacy.response.status, 200);
  const projectsBody = legacy.body.projects as unknown[];
  assert.equal(projectsBody.length, LEGACY_LIST_HARD_CAP);
  assert.equal(legacy.body.has_more, true);
  assert.equal(legacy.body.limit, LEGACY_LIST_HARD_CAP);
  assert.ok(legacy.hint?.includes("paginated=true"));

  const paged = await json(
    app,
    `/api/v1/projects?paginated=true&limit=${LEGACY_LIST_HARD_CAP}`,
    secret,
  );
  assert.equal(paged.response.status, 200);
  const items = paged.body.items as unknown[];
  assert.equal(items.length, LEGACY_LIST_HARD_CAP);
  assert.equal(typeof paged.body.nextCursor, "string");
});
