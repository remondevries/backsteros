import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  summarizeAgentActivity,
  summarizeStatusBarAgents,
  type StatusBarAgentItem,
} from "./agent-activity.ts";

describe("summarizeStatusBarAgents", () => {
  it("counts only actively linked agent tasks", () => {
    const items: StatusBarAgentItem[] = [
      {
        taskId: "t1",
        projectId: "p1",
        projectLabel: "Alpha",
        activity: "working",
      },
      {
        taskId: "t2",
        projectId: "p1",
        projectLabel: "Alpha",
        activity: "idle",
      },
    ];
    const summary = summarizeStatusBarAgents(items);
    assert.equal(summary.total, 2);
    assert.equal(summary.working, 1);
    assert.equal(summary.idle, 1);
  });

  it("is empty when no agents are linked", () => {
    const summary = summarizeStatusBarAgents([]);
    assert.deepEqual(summary, {
      working: 0,
      attention: 0,
      idle: 0,
      present: 0,
      total: 0,
    });
  });
});

describe("summarizeAgentActivity", () => {
  it("still counts raw session activity (legacy helper)", () => {
    const summary = summarizeAgentActivity({
      a: "idle",
      b: "working",
      c: null,
    });
    assert.equal(summary.total, 2);
    assert.equal(summary.working, 1);
    assert.equal(summary.idle, 1);
  });
});
