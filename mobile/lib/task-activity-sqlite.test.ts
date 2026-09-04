import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sqliteRowToTaskActivity } from "./task-activity-sqlite.ts";

describe("sqliteRowToTaskActivity", () => {
  it("maps a status change row with JSON data text", () => {
    const activity = sqliteRowToTaskActivity({
      id: "act_1",
      task_id: "task_1",
      type: "status_changed",
      actor_user_id: "user_1",
      actor_contact_id: null,
      actor_email: "remon@example.com",
      actor_name: "Remon",
      data: JSON.stringify({ from: "ready_to_start", to: "in_progress" }),
      created_at: "2026-09-01T10:00:00.000Z",
    });
    assert.deepEqual(activity, {
      id: "act_1",
      taskId: "task_1",
      type: "status_changed",
      actorUserId: "user_1",
      actorContactId: null,
      actorEmail: "remon@example.com",
      actorName: "Remon",
      data: { from: "ready_to_start", to: "in_progress" },
      createdAt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("returns null for unknown activity types", () => {
    assert.equal(
      sqliteRowToTaskActivity({
        id: "act_2",
        task_id: "task_1",
        type: "not_a_real_type",
        actor_user_id: null,
        actor_contact_id: null,
        actor_email: null,
        actor_name: null,
        data: "{}",
        created_at: "2026-09-01T10:00:00.000Z",
      }),
      null,
    );
  });
});
