import assert from "node:assert/strict";
import test from "node:test";

import { sqlClient } from "../db/index.js";
import { createTestWorkspace } from "./test-workspace.js";

test("CRM routes: organization, contact, relationship and group CRUD", async (context) => {
  const ws = await createTestWorkspace("crm");
  context.after(async () => {
    await ws.cleanup();
    await sqlClient.end();
  });

  // Organizations
  const createdOrg = await ws.call("POST", "/api/v1/organizations", {
    key: "ACME",
    name: "Acme Holding",
  });
  assert.equal(createdOrg.status, 201);
  const orgId = String(createdOrg.body?.id);
  assert.equal(createdOrg.body?.name, "Acme Holding");
  assert.equal(createdOrg.body?.key, "ACME");

  const patchedOrg = await ws.call("PATCH", `/api/v1/organizations/${orgId}`, {
    name: "Acme",
  });
  assert.equal(patchedOrg.status, 200);
  assert.equal(patchedOrg.body?.name, "Acme");

  const fetchedOrg = await ws.call("GET", `/api/v1/organizations/${orgId}`);
  assert.equal(fetchedOrg.status, 200);
  assert.equal(fetchedOrg.body?.name, "Acme");

  const orgList = await ws.call("GET", "/api/v1/organizations");
  assert.equal(orgList.status, 200);
  const orgRows = (orgList.body?.organizations ?? orgList.body?.items) as
    | Array<{ id: string }>
    | undefined;
  assert.ok(orgRows?.some((row) => row.id === orgId));

  // Contacts
  const ada = await ws.call("POST", "/api/v1/contacts", {
    key: "ADA",
    firstName: "Ada",
    lastName: "Lovelace",
    organizationId: orgId,
  });
  assert.equal(ada.status, 201);
  const adaId = String(ada.body?.id);
  assert.equal(ada.body?.organizationId, orgId);

  const grace = await ws.call("POST", "/api/v1/contacts", {
    key: "GRACE",
    firstName: "Grace",
    lastName: "Hopper",
  });
  assert.equal(grace.status, 201);
  const graceId = String(grace.body?.id);

  const patchedAda = await ws.call("PATCH", `/api/v1/contacts/${adaId}`, {
    lastName: "King",
  });
  assert.equal(patchedAda.status, 200);
  assert.equal(patchedAda.body?.lastName, "King");

  // Relationships
  const relationship = await ws.call(
    "POST",
    `/api/v1/contacts/${adaId}/relationships`,
    { toContactId: graceId, type: "colleague" },
  );
  assert.equal(relationship.status, 201);
  const relationshipId = String(relationship.body?.id);
  assert.equal(relationship.body?.toContactId, graceId);

  const relationships = await ws.call(
    "GET",
    `/api/v1/contacts/${adaId}/relationships`,
  );
  assert.equal(relationships.status, 200);
  assert.match(JSON.stringify(relationships.body), new RegExp(relationshipId));

  const deletedRelationship = await ws.call(
    "DELETE",
    `/api/v1/contact-relationships/${relationshipId}`,
  );
  assert.equal(deletedRelationship.status, 204);

  // Groups + members
  const group = await ws.call("POST", "/api/v1/crm-groups", {
    name: "Investors",
  });
  assert.equal(group.status, 201);
  const groupId = String(group.body?.id);

  const patchedGroup = await ws.call("PATCH", `/api/v1/crm-groups/${groupId}`, {
    description: "Seed round",
  });
  assert.equal(patchedGroup.status, 200);
  assert.equal(patchedGroup.body?.description, "Seed round");

  const member = await ws.call("POST", `/api/v1/crm-groups/${groupId}/members`, {
    subjectType: "contact",
    subjectId: adaId,
  });
  assert.equal(member.status, 201, JSON.stringify(member.body));

  const contactGroups = await ws.call("GET", `/api/v1/contacts/${adaId}/groups`);
  assert.equal(contactGroups.status, 200);
  assert.match(JSON.stringify(contactGroups.body), new RegExp(groupId));

  const members = await ws.call("GET", `/api/v1/crm-groups/${groupId}/members`);
  assert.equal(members.status, 200);
  const memberRows = (members.body?.members ?? members.body?.items) as
    | Array<{ id: string; subjectId: string }>
    | undefined;
  const adaMember = memberRows?.find((row) => row.subjectId === adaId);
  assert.ok(adaMember, JSON.stringify(members.body));

  const removedMember = await ws.call(
    "DELETE",
    `/api/v1/crm-groups/${groupId}/members/${adaMember.id}`,
  );
  assert.equal(removedMember.status, 204);

  const deletedGroup = await ws.call("DELETE", `/api/v1/crm-groups/${groupId}`);
  assert.equal(deletedGroup.status, 204);

  // Deletes
  const deletedGrace = await ws.call("DELETE", `/api/v1/contacts/${graceId}`);
  assert.equal(deletedGrace.status, 204);
  const missingGrace = await ws.call("GET", `/api/v1/contacts/${graceId}`);
  assert.equal(missingGrace.status, 404);

  const deletedOrg = await ws.call("DELETE", `/api/v1/organizations/${orgId}`);
  assert.equal(deletedOrg.status, 204);
  const missingOrg = await ws.call("GET", `/api/v1/organizations/${orgId}`);
  assert.equal(missingOrg.status, 404);

  // Every write leaves a sync event clients can pull.
  assert.deepEqual(await ws.syncOperations("organization", orgId), [
    "upsert",
    "upsert",
    "delete",
  ]);
  const graceOps = await ws.syncOperations("contact", graceId);
  assert.equal(graceOps[0], "upsert");
  assert.equal(graceOps.at(-1), "delete");
});
