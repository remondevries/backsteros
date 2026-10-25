import assert from "node:assert/strict";
import test from "node:test";

import { sqlClient } from "../db/index.js";
import { globalSearch } from "../services/crm-domain.js";
import { createTestWorkspace } from "./test-workspace.js";

type Hit = Awaited<ReturnType<typeof globalSearch>>[number];

const ids = (hits: Hit[], type: Hit["type"]) =>
  hits.filter((hit) => hit.type === type).map((hit) => hit.id).sort();

test("globalSearch: modes, context scopes, excluded statuses and result shape", async (context) => {
  const ws = await createTestWorkspace("global-search");
  const other = await createTestWorkspace("global-search-other");
  context.after(async () => {
    await ws.cleanup();
    await other.cleanup();
    await sqlClient.end();
  });

  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await ws.call("POST", path, body);
    assert.equal(response.status, 201, `${path}: ${JSON.stringify(response.body)}`);
    return String(response.body?.id);
  };

  const orgId = await created("/api/v1/organizations", { key: "NEB", name: "Nebula Labs" });
  const orgContactId = await created("/api/v1/contacts", {
    key: "NOVA",
    firstName: "Nova",
    lastName: "Nebula",
    organizationId: orgId,
  });
  const looseContactId = await created("/api/v1/contacts", {
    key: "ORION",
    firstName: "Orion",
    lastName: "Nebula",
  });
  const orgProjectId = await created("/api/v1/projects", {
    key: "NP",
    name: "Nebula platform",
    status: "active",
    organizationId: orgId,
  });
  const looseProjectId = await created("/api/v1/projects", {
    key: "NS",
    name: "Nebula side project",
    status: "backlog",
  });
  await created("/api/v1/projects", {
    key: "NC",
    name: "Nebula closed project",
    status: "completed",
  });
  const taskId = await created("/api/v1/tasks", {
    projectId: orgProjectId,
    title: "Nebula launch checklist",
  });
  const inboxTaskId = await created("/api/v1/tasks", {
    title: "Nebula inbox follow-up",
    inbox: true,
  });
  const orgLetterId = await created("/api/v1/letters", {
    title: "Nebula contract",
    organizationId: orgId,
    direction: "incoming",
  });
  const projectLetterId = await created("/api/v1/letters", {
    title: "Nebula invoice",
    projectId: looseProjectId,
    direction: "incoming",
  });

  const otherOrg = await other.call("POST", "/api/v1/organizations", {
    key: "NEB",
    name: "Nebula elsewhere",
  });
  assert.equal(otherOrg.status, 201);

  const all = await globalSearch(ws.workspaceId, "nebula", 50);
  assert.deepEqual(ids(all, "organization"), [orgId]);
  assert.deepEqual(ids(all, "contact"), [orgContactId, looseContactId].sort());
  assert.deepEqual(
    ids(all, "project"),
    [orgProjectId, looseProjectId].sort(),
    "completed/canceled/duplicated projects stay out of search",
  );
  assert.deepEqual(ids(all, "task"), [taskId, inboxTaskId].sort());
  assert.deepEqual(ids(all, "letter"), [orgLetterId, projectLetterId].sort());

  const updatedAt = all.map((hit) => hit.updatedAt);
  assert.deepEqual(updatedAt, [...updatedAt].sort().reverse(), "newest first");

  const project = all.find((hit) => hit.id === orgProjectId);
  assert.equal(project?.title, "Nebula platform");
  assert.equal(project?.projectStatus, "active");
  const task = all.find((hit) => hit.id === taskId);
  assert.equal(task?.projectId, orgProjectId);
  assert.ok(task?.key, "task hits carry their display key");
  assert.equal(task?.status, "backlog");
  const contact = all.find((hit) => hit.id === orgContactId);
  assert.equal(contact?.title, "Nova Nebula");
  assert.ok(!("documentType" in (contact ?? {})), "null optional fields are omitted");

  const limited = await globalSearch(ws.workspaceId, "nebula", 3);
  assert.equal(limited.length, 3);
  assert.deepEqual(limited, all.slice(0, 3));

  const contactsOnly = await globalSearch(ws.workspaceId, "nebula", 50, { mode: "contacts" });
  assert.deepEqual(
    [...new Set(contactsOnly.map((hit) => hit.type))],
    ["contact"],
  );

  const projectsOnly = await globalSearch(ws.workspaceId, "platform", 50, { mode: "projects" });
  assert.deepEqual(ids(projectsOnly, "project"), [orgProjectId]);
  assert.equal(projectsOnly.length, 1);

  const orgContacts = await globalSearch(ws.workspaceId, "nebula", 50, {
    contextKind: "organization",
    organizationId: orgId,
    organizationSection: "contacts",
  });
  assert.deepEqual(ids(orgContacts, "contact"), [orgContactId]);
  assert.equal(orgContacts.length, 1);

  const orgOverview = await globalSearch(ws.workspaceId, "nebula", 50, {
    contextKind: "organization",
    organizationId: orgId,
  });
  assert.deepEqual(ids(orgOverview, "project"), [orgProjectId]);
  assert.deepEqual(ids(orgOverview, "contact"), [orgContactId]);
  assert.deepEqual(ids(orgOverview, "letter"), [orgLetterId]);
  assert.deepEqual(ids(orgOverview, "task"), []);

  const projectOverview = await globalSearch(ws.workspaceId, "nebula", 50, {
    contextKind: "project",
    projectId: looseProjectId,
  });
  assert.deepEqual(ids(projectOverview, "letter"), [projectLetterId]);
  assert.deepEqual(ids(projectOverview, "task"), []);
  assert.deepEqual(ids(projectOverview, "project"), []);

  const inbox = await globalSearch(ws.workspaceId, "nebula", 50, { contextKind: "inbox" });
  assert.deepEqual(ids(inbox, "task"), [inboxTaskId]);
  assert.equal(inbox.length, 1);

  const modeWins = await globalSearch(ws.workspaceId, "nebula", 50, {
    mode: "organizations",
    contextKind: "inbox",
  });
  assert.deepEqual(ids(modeWins, "organization"), [orgId]);
  assert.equal(modeWins.length, 1, "context params only apply in mode=all");

  const unknownContext = await globalSearch(ws.workspaceId, "nebula", 50, {
    contextKind: "nonsense",
  });
  assert.deepEqual(unknownContext, all, "unknown context falls back to mode scope");
});
