import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import {
  apiKeys,
  contacts,
  organizations,
  projects,
  tasks,
  users,
  workspaces,
} from "../db/schema.js";
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
  return {
    response,
    body: (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null,
  };
}

test("OS-58: path keys and filter refs resolve; unknown filters → 400", async (context) => {
  const app = createApp();
  const userId = id("user");
  const workspaceId = id("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;
  const projectId = id("project");
  const orgId = id("org");
  const contactId = id("contact");
  const taskId = id("task");
  const completedTaskId = id("task");

  context.after(async () => {
    await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db
      .delete(organizations)
      .where(eq(organizations.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: "os58@example.test",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-58",
    slug: id("os58"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: id("key"),
    workspaceId,
    userId,
    name: "os58",
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });
  await db.insert(organizations).values({
    id: orgId,
    workspaceId,
    key: "IN",
    name: "InShared",
  });
  await db.insert(contacts).values({
    id: contactId,
    workspaceId,
    organizationId: orgId,
    key: "RDV",
    name: "Remon",
    firstName: "Remon",
    lastName: "de Vries",
  });
  await db.insert(projects).values({
    id: projectId,
    workspaceId,
    key: "QM",
    name: "Quarrymill",
    status: "active",
  });
  await db.insert(tasks).values([
    {
      id: taskId,
      workspaceId,
      projectId,
      number: 38,
      title: "Key lookup task",
      status: "in_progress",
      assigneeId: contactId,
      relatedContactIds: [contactId],
      relatedOrganizationIds: [orgId],
    },
    {
      id: completedTaskId,
      workspaceId,
      projectId,
      number: 39,
      title: "Completed key task",
      status: "completed",
      completedAt: new Date(),
      assigneeId: null,
      relatedContactIds: [],
    },
  ]);

  // GET /tasks/QM-38 and case-insensitive /tasks/qm-38
  const byKey = await json(app, "/api/v1/tasks/QM-38", secret);
  assert.equal(byKey.response.status, 200);
  assert.equal(byKey.body?.id, taskId);
  assert.equal(byKey.body?.key, "QM-38");

  const byLower = await json(app, "/api/v1/tasks/qm-38", secret);
  assert.equal(byLower.response.status, 200);
  assert.equal(byLower.body?.id, taskId);

  const missing = await json(app, "/api/v1/tasks/QM-99999", secret);
  assert.equal(missing.response.status, 404);

  // Still works by internal id
  const byId = await json(app, `/api/v1/tasks/${taskId}`, secret);
  assert.equal(byId.response.status, 200);
  assert.equal(byId.body?.key, "QM-38");

  // PATCH + comment by key
  const patched = await json(app, "/api/v1/tasks/QM-38", secret, {
    method: "PATCH",
    body: JSON.stringify({ title: "Key lookup task (patched)" }),
  });
  assert.equal(patched.response.status, 200);
  assert.equal(patched.body?.title, "Key lookup task (patched)");

  const commented = await json(app, "/api/v1/tasks/QM-38/comments", secret, {
    method: "POST",
    body: JSON.stringify({ body: "OS-58 comment by key" }),
  });
  assert.equal(commented.response.status, 201);

  // Projects + organizations by key
  const project = await json(app, "/api/v1/projects/QM", secret);
  assert.equal(project.response.status, 200);
  assert.equal(project.body?.id, projectId);
  assert.equal(project.body?.key, "QM");

  const org = await json(app, "/api/v1/organizations/IN", secret);
  assert.equal(org.response.status, 200);
  assert.equal(org.body?.id, orgId);
  assert.equal(org.body?.key, "IN");

  const contact = await json(app, "/api/v1/contacts/RDV", secret);
  assert.equal(contact.response.status, 200);
  assert.equal(contact.body?.id, contactId);

  // Paginated filters: project key works; unknown → 400 with field
  const filtered = await json(
    app,
    "/api/v1/tasks?paginated=true&projectId=QM&status=completed",
    secret,
  );
  assert.equal(filtered.response.status, 200);
  const items = filtered.body?.items as Array<{ id: string; key: string }>;
  assert.ok(Array.isArray(items));
  assert.ok(items.some((row) => row.id === completedTaskId));
  assert.ok(items.every((row) => row.key.startsWith("QM-")));

  const byProjectKey = await json(
    app,
    "/api/v1/tasks?paginated=true&projectKey=qm&status=in_progress",
    secret,
  );
  assert.equal(byProjectKey.response.status, 200);
  const openItems = byProjectKey.body?.items as Array<{ id: string }>;
  assert.ok(openItems.some((row) => row.id === taskId));

  const unknownProject = await json(
    app,
    "/api/v1/tasks?paginated=true&projectId=doesnotexist",
    secret,
  );
  assert.equal(unknownProject.response.status, 400);
  assert.equal(unknownProject.body?.field, "projectId");

  const unknownAssignee = await json(
    app,
    "/api/v1/tasks?paginated=true&assigneeId=doesnotexist",
    secret,
  );
  assert.equal(unknownAssignee.response.status, 400);
  assert.equal(unknownAssignee.body?.field, "assigneeId");

  const byAssigneeKey = await json(
    app,
    "/api/v1/tasks?paginated=true&assigneeId=RDV&status=in_progress",
    secret,
  );
  assert.equal(byAssigneeKey.response.status, 200);
  const assigned = byAssigneeKey.body?.items as Array<{ id: string }>;
  assert.ok(assigned.some((row) => row.id === taskId));
});
