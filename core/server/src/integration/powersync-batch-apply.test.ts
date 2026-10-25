import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq, like } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  areas,
  contactRelationships,
  contacts,
  crmGroupMembers,
  crmGroups,
  financialCategories,
  habits,
  meetings,
  organizations,
  projects,
  syncEvents,
  taskComments,
  tasks,
} from "../db/schema.js";
import { applyPowerSyncBatch } from "../services/sync.js";
import { createTestWorkspace } from "./test-workspace.js";

type BatchEntry = Parameters<typeof applyPowerSyncBatch>[0]["batch"][number];

const rowId = () => randomUUID().replaceAll("-", "").slice(0, 21);

/**
 * Characterization of the PowerSync upload path (`applyPowerSyncBatch` →
 * `applySyncChange` + `recordSyncEvent`): one batch per entity family, then
 * the persisted rows and the per-entry sync events are pinned.
 */
test("applyPowerSyncBatch writes rows and sync events per entity family", async (context) => {
  const ws = await createTestWorkspace("powersync-batch");
  const deviceId = `device-${randomUUID()}`;
  context.after(async () => {
    await ws.cleanup();
    await sqlClient.end();
  });

  async function apply(label: string, batch: BatchEntry[]) {
    const mutationId = `${label}-${randomUUID()}`;
    const result = await applyPowerSyncBatch({
      workspaceId: ws.workspaceId,
      deviceId,
      mutationId,
      batch,
    });
    assert.deepEqual(result, { ok: true, duplicate: false }, label);
    const events = await db
      .select({
        mutationId: syncEvents.mutationId,
        entity: syncEvents.entity,
        entityId: syncEvents.entityId,
        operation: syncEvents.operation,
        deviceId: syncEvents.deviceId,
      })
      .from(syncEvents)
      .where(
        and(
          eq(syncEvents.workspaceId, ws.workspaceId),
          like(syncEvents.mutationId, `${mutationId}:%`),
        ),
      )
      .orderBy(syncEvents.cursor);
    return { mutationId, events };
  }

  // Projects + tasks
  const projectId = rowId();
  const taskId = rowId();
  const projectsTasks = await apply("projects-tasks", [
    {
      table: "projects",
      op: "PUT",
      id: projectId,
      data: { key: "PSB", name: "PowerSync batch", type: "general", status: "active" },
    },
    {
      table: "tasks",
      op: "PUT",
      id: taskId,
      data: { project_id: projectId, title: "Write test", status: "ready_to_start" },
    },
    { table: "tasks", op: "PATCH", id: taskId, data: { title: "Write tests" } },
  ]);
  assert.deepEqual(
    projectsTasks.events.map((event) => [
      event.mutationId.slice(projectsTasks.mutationId.length),
      event.entity,
      event.entityId,
      event.operation,
      event.deviceId,
    ]),
    [
      [":0", "project", projectId, "upsert", deviceId],
      [":1", "task", taskId, "upsert", deviceId],
      [":2", "task", taskId, "upsert", deviceId],
    ],
  );
  const [projectRow] = await db.select().from(projects).where(eq(projects.id, projectId));
  assert.equal(projectRow?.key, "PSB");
  assert.equal(projectRow?.workspaceId, ws.workspaceId);
  const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  assert.equal(taskRow?.title, "Write tests");
  assert.equal(taskRow?.projectId, projectId);
  assert.equal(taskRow?.status, "ready_to_start");
  assert.equal(typeof taskRow?.number, "number");

  // Replaying the same mutation id is acknowledged without re-applying.
  const replay = await applyPowerSyncBatch({
    workspaceId: ws.workspaceId,
    deviceId,
    mutationId: projectsTasks.mutationId,
    batch: [{ table: "tasks", op: "PATCH", id: taskId, data: { title: "Replayed" } }],
  });
  assert.deepEqual(replay, { ok: true, duplicate: true });
  const [afterReplay] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  assert.equal(afterReplay?.title, "Write tests");

  // Task comments
  const commentId = rowId();
  const comments = await apply("task-comments", [
    {
      table: "task_comments",
      op: "PUT",
      id: commentId,
      data: { task_id: taskId, body: "Looks good" },
    },
  ]);
  assert.deepEqual(
    comments.events.map((event) => [event.entity, event.operation]),
    [["task_comment", "upsert"]],
  );
  const [commentRow] = await db
    .select()
    .from(taskComments)
    .where(eq(taskComments.id, commentId));
  assert.equal(commentRow?.taskId, taskId);
  assert.equal(commentRow?.body, "Looks good");

  // CRM
  const organizationId = rowId();
  const adaId = rowId();
  const graceId = rowId();
  const groupId = rowId();
  const memberId = rowId();
  const relationshipId = rowId();
  const crm = await apply("crm", [
    { table: "organizations", op: "PUT", id: organizationId, data: { key: "PSBO", name: "Acme" } },
    {
      table: "contacts",
      op: "PUT",
      id: adaId,
      data: {
        key: "ADA",
        name: "Ada Lovelace",
        organization_id: organizationId,
        portal_password_hash: "must-not-be-stored",
      },
    },
    { table: "contacts", op: "PUT", id: graceId, data: { key: "GRACE", name: "Grace Hopper" } },
    { table: "crm_groups", op: "PUT", id: groupId, data: { name: "Investors" } },
    {
      table: "crm_group_members",
      op: "PUT",
      id: memberId,
      data: { group_id: groupId, subject_type: "contact", subject_id: adaId },
    },
    {
      table: "contact_relationships",
      op: "PUT",
      id: relationshipId,
      data: { from_contact_id: adaId, to_contact_id: graceId, type: "colleague" },
    },
  ]);
  assert.deepEqual(
    crm.events.map((event) => [event.entity, event.entityId]),
    [
      ["organization", organizationId],
      ["contact", adaId],
      ["contact", graceId],
      ["crm_group", groupId],
      ["crm_group_member", memberId],
      ["contact_relationship", relationshipId],
    ],
  );
  const [orgRow] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  assert.equal(orgRow?.name, "Acme");
  const [adaRow] = await db.select().from(contacts).where(eq(contacts.id, adaId));
  assert.equal(adaRow?.organizationId, organizationId);
  assert.equal(adaRow?.portalPasswordHash ?? null, null);
  const [groupRow] = await db.select().from(crmGroups).where(eq(crmGroups.id, groupId));
  assert.equal(groupRow?.name, "Investors");
  const [memberRow] = await db
    .select()
    .from(crmGroupMembers)
    .where(eq(crmGroupMembers.id, memberId));
  assert.equal(memberRow?.groupId, groupId);
  assert.equal(memberRow?.subjectId, adaId);
  const [relationshipRow] = await db
    .select()
    .from(contactRelationships)
    .where(eq(contactRelationships.id, relationshipId));
  assert.equal(relationshipRow?.fromContactId, adaId);
  assert.equal(relationshipRow?.toContactId, graceId);

  // Areas + finance
  const areaId = rowId();
  const categoryId = rowId();
  const areasFinance = await apply("areas-finance", [
    { table: "areas", op: "PUT", id: areaId, data: { name: "Operations", parent: "business" } },
    {
      table: "financial_categories",
      op: "PUT",
      id: categoryId,
      data: { name: "Software" },
    },
  ]);
  assert.deepEqual(
    areasFinance.events.map((event) => event.entity),
    ["area", "financial_category"],
  );
  const [areaRow] = await db.select().from(areas).where(eq(areas.id, areaId));
  assert.equal(areaRow?.name, "Operations");
  const [categoryRow] = await db
    .select()
    .from(financialCategories)
    .where(eq(financialCategories.id, categoryId));
  assert.equal(categoryRow?.name, "Software");

  // Meetings + habits
  const meetingId = rowId();
  const habitId = rowId();
  const meetingsHabits = await apply("meetings-habits", [
    {
      table: "meetings",
      op: "PUT",
      id: meetingId,
      data: { title: "Weekly sync", project_id: projectId, status: "ready_to_start" },
    },
    {
      table: "habits",
      op: "PUT",
      id: habitId,
      data: { title: "Stretch", cadence: "daily", project_id: projectId },
    },
  ]);
  const meetingHabitEntities = meetingsHabits.events.map((event) => event.entity);
  assert.equal(meetingHabitEntities[0], "meeting");
  assert.ok(meetingHabitEntities.includes("habit"));
  const [meetingRow] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  assert.equal(meetingRow?.title, "Weekly sync");
  assert.equal(meetingRow?.projectId, projectId);
  const [habitRow] = await db.select().from(habits).where(eq(habits.id, habitId));
  assert.equal(habitRow?.title, "Stretch");

  // Deletes are recorded as delete events and soft-delete the rows.
  const deletes = await apply("deletes", [
    { table: "tasks", op: "DELETE", id: taskId },
    { table: "contacts", op: "DELETE", id: graceId },
  ]);
  assert.deepEqual(
    deletes.events.map((event) => [event.entity, event.operation]),
    [
      ["task", "delete"],
      ["contact", "delete"],
    ],
  );
  const [deletedTask] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  assert.ok(!deletedTask || deletedTask.deletedAt instanceof Date);
  const [deletedGrace] = await db.select().from(contacts).where(eq(contacts.id, graceId));
  assert.ok(!deletedGrace || deletedGrace.deletedAt instanceof Date);
});
