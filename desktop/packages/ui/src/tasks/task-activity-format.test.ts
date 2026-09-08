import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TaskActivity } from "@backsteros/contracts";

import {
  coalescePropertyActivities,
  groupConsecutiveAgentWorked,
} from "./task-activity-format.ts";

function activity(
  partial: Partial<TaskActivity> &
    Pick<TaskActivity, "id" | "type" | "data" | "createdAt">,
): TaskActivity {
  return {
    taskId: "t1",
    actorUserId: "u1",
    actorContactId: null,
    actorEmail: null,
    actorName: "Remon",
    ...partial,
  };
}

describe("coalescePropertyActivities", () => {
  it("is used by the feed and drops status ping-pong around agent_worked", () => {
    const now = Date.now();
    const grouped = coalescePropertyActivities([
      activity({
        id: "1",
        type: "status_changed",
        actorUserId: null,
        actorName: "Agent",
        data: { from: "in_review", to: "in_progress" },
        createdAt: new Date(now).toISOString(),
      }),
      activity({
        id: "w1",
        type: "agent_worked",
        actorUserId: null,
        actorName: "Agent",
        data: { durationMs: 120_000 },
        createdAt: new Date(now + 60_000).toISOString(),
      }),
      activity({
        id: "2",
        type: "status_changed",
        actorUserId: null,
        actorName: "Agent",
        data: { from: "in_progress", to: "in_review" },
        createdAt: new Date(now + 180_000).toISOString(),
      }),
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]!.activity.type, "agent_worked");
  });

  it("groups consecutive agent_worked after coalesce", () => {
    const now = Date.now();
    const grouped = groupConsecutiveAgentWorked(
      coalescePropertyActivities([
        activity({
          id: "a1",
          type: "agent_worked",
          actorUserId: null,
          actorName: "Agent",
          data: { durationMs: 3000, totalTokens: 1000 },
          createdAt: new Date(now).toISOString(),
        }),
        activity({
          id: "a2",
          type: "agent_worked",
          actorUserId: null,
          actorName: "Agent",
          data: { durationMs: 5000, totalTokens: 2000 },
          createdAt: new Date(now + 60_000).toISOString(),
        }),
      ]),
    );
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]!.children?.length, 2);
  });
});
