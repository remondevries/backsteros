import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAgentHoldCommentBody } from "./agent-hold-comment.ts";
import {
  coalescePropertyActivities,
  formatActivityMessage,
  formatRelativeTime,
  groupConsecutiveAgentWorked,
  isAgentComment,
} from "./task-activity-format.ts";

describe("agent-hold-comment", () => {
  it("detects hold prefixes", () => {
    assert.equal(
      isAgentHoldCommentBody("Agent needs input before it can continue.\nWhy?"),
      true,
    );
    assert.equal(isAgentHoldCommentBody("Hello"), false);
  });
});

describe("task-activity-format", () => {
  it("formats relative time", () => {
    assert.equal(formatRelativeTime(new Date().toISOString()), "just now");
  });

  it("coalesces rapid status changes", () => {
    const now = Date.now();
    const grouped = coalescePropertyActivities([
      {
        id: "1",
        taskId: "t",
        type: "status_changed",
        actorUserId: "u",
        actorEmail: null,
        actorName: "Remon",
        data: { from: "triage", to: "in_progress" },
        createdAt: new Date(now).toISOString(),
      },
      {
        id: "2",
        taskId: "t",
        type: "status_changed",
        actorUserId: "u",
        actorEmail: null,
        actorName: "Remon",
        data: { from: "in_progress", to: "completed" },
        createdAt: new Date(now + 1000).toISOString(),
      },
    ]);
    assert.equal(grouped.length, 1);
    assert.match(
      formatActivityMessage(grouped[0]!.activity),
      /Triage.*Completed/,
    );
  });

  it("detects agent comments", () => {
    assert.equal(
      isAgentComment({
        authorUserId: null,
        authorName: "Agent",
        body: "Working",
      }),
      true,
    );
  });

  it("groups consecutive agent_worked turns and sums stats", () => {
    const now = Date.now();
    const grouped = groupConsecutiveAgentWorked(
      coalescePropertyActivities([
        {
          id: "a1",
          taskId: "t",
          type: "agent_worked",
          actorUserId: null,
          actorEmail: null,
          actorName: "Agent",
          data: { durationMs: 3000, totalTokens: 1000 },
          createdAt: new Date(now).toISOString(),
        },
        {
          id: "a2",
          taskId: "t",
          type: "agent_worked",
          actorUserId: null,
          actorEmail: null,
          actorName: "Agent",
          data: { durationMs: 5000, totalTokens: 2000 },
          createdAt: new Date(now + 60_000).toISOString(),
        },
        {
          id: "s1",
          taskId: "t",
          type: "status_changed",
          actorUserId: null,
          actorEmail: null,
          actorName: "Agent",
          data: { from: "in_progress", to: "on_hold" },
          createdAt: new Date(now + 120_000).toISOString(),
        },
        {
          id: "a3",
          taskId: "t",
          type: "agent_worked",
          actorUserId: null,
          actorEmail: null,
          actorName: "Agent",
          data: { durationMs: 1000, totalTokens: 500 },
          createdAt: new Date(now + 180_000).toISOString(),
        },
      ]),
    );
    assert.equal(grouped.length, 3);
    assert.equal(grouped[0]!.children?.length, 2);
    assert.equal(grouped[0]!.activity.data.durationMs, 8000);
    assert.equal(grouped[0]!.activity.data.totalTokens, 3000);
    assert.match(formatActivityMessage(grouped[0]!.activity), /8s.*3k tokens/);
    assert.equal(grouped[1]!.activity.type, "status_changed");
    assert.equal(grouped[2]!.children, undefined);
  });
});
