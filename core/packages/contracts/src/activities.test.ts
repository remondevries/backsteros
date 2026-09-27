import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  listActivitiesQuerySchema,
  taskActivityTypeSchema,
} from "./schemas.js";
import {
  splitTaskActivityFeed,
  taskActivityToTaskComment,
  TASK_SYSTEM_ACTIVITY_TYPES,
} from "./activity-feed.js";

describe("unified activities contract", () => {
  it("includes comment as a first-class activity type", () => {
    assert.ok(taskActivityTypeSchema.options.includes("comment"));
  });

  it("requires taskId or projectId", () => {
    const missing = listActivitiesQuerySchema.safeParse({ limit: 10 });
    assert.equal(missing.success, false);

    const byTask = listActivitiesQuerySchema.safeParse({
      taskId: "task_1",
      types: "comment,status_changed",
    });
    assert.equal(byTask.success, true);
    if (byTask.success) {
      assert.equal(byTask.data.taskId, "task_1");
      assert.equal(byTask.data.types, "comment,status_changed");
      assert.equal(byTask.data.limit, 50);
    }

    const byProject = listActivitiesQuerySchema.safeParse({
      projectId: "proj_1",
      includeDeleted: "true",
      limit: "25",
    });
    assert.equal(byProject.success, true);
    if (byProject.success) {
      assert.equal(byProject.data.projectId, "proj_1");
      assert.equal(byProject.data.includeDeleted, true);
      assert.equal(byProject.data.limit, 25);
    }
  });

  it("splits unified feed into events and comments", () => {
    const { events, comments } = splitTaskActivityFeed([
      {
        id: "e1",
        taskId: "t1",
        type: "status_changed",
        actorUserId: null,
        actorContactId: null,
        actorEmail: null,
        actorName: "Agent",
        data: { from: "ready_to_start", to: "in_progress" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "c1",
        taskId: "t1",
        type: "comment",
        actorUserId: null,
        actorContactId: "contact_1",
        actorEmail: null,
        actorName: "Remon",
        data: {},
        body: "Looks good",
        parentId: null,
        resolvedAt: null,
        createdAt: "2026-01-01T01:00:00.000Z",
        updatedAt: "2026-01-01T01:00:00.000Z",
        deletedAt: null,
      },
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, "status_changed");
    assert.equal(comments.length, 1);
    assert.equal(comments[0]?.body, "Looks good");
    assert.equal(taskActivityToTaskComment(events[0]!), null);
    assert.ok(
      (TASK_SYSTEM_ACTIVITY_TYPES as readonly string[]).includes(
        "status_changed",
      ),
    );
  });
});
