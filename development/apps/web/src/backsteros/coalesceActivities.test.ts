import { describe, expect, it } from "vite-plus/test";

import {
  BACKSTEROS_ACTIVITY_COALESCE_WINDOW_MS,
  buildBacksterosActivityTimeline,
  coalescePropertyActivities,
  groupConsecutiveAgentWorked,
} from "./coalesceActivities";
import type { BacksterosTaskActivity } from "./types";

function activity(
  partial: Partial<BacksterosTaskActivity> &
    Pick<BacksterosTaskActivity, "id" | "type" | "data" | "createdAt">,
): BacksterosTaskActivity {
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
  it("merges rapid status changes into one from→to row", () => {
    const now = Date.now();
    const grouped = coalescePropertyActivities([
      activity({
        id: "1",
        type: "status_changed",
        data: { from: "open", to: "in_progress" },
        createdAt: new Date(now).toISOString(),
      }),
      activity({
        id: "2",
        type: "status_changed",
        data: { from: "in_progress", to: "in_review" },
        createdAt: new Date(now + 1_000).toISOString(),
      }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.activity.data).toMatchObject({
      from: "open",
      to: "in_review",
    });
  });

  it("drops a status ping-pong that reverts within the window", () => {
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
        id: "2",
        type: "status_changed",
        actorUserId: null,
        actorName: "Agent",
        data: { from: "in_progress", to: "in_review" },
        createdAt: new Date(now + 2_000).toISOString(),
      }),
    ]);
    expect(grouped).toHaveLength(0);
  });

  it("drops status ping-pong even when agent_worked sits between turns", () => {
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
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.activity.type).toBe("agent_worked");
  });

  it("does not coalesce non-status properties across the 30s window", () => {
    const now = Date.now();
    const grouped = coalescePropertyActivities([
      activity({
        id: "1",
        type: "priority_changed",
        data: { from: 0, to: 1 },
        createdAt: new Date(now).toISOString(),
      }),
      activity({
        id: "2",
        type: "priority_changed",
        data: { from: 1, to: 2 },
        createdAt: new Date(now + BACKSTEROS_ACTIVITY_COALESCE_WINDOW_MS + 1).toISOString(),
      }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it("counts identical status spam", () => {
    const now = Date.now();
    const grouped = coalescePropertyActivities([
      activity({
        id: "1",
        type: "status_changed",
        data: { from: "open", to: "in_progress" },
        createdAt: new Date(now).toISOString(),
      }),
      activity({
        id: "2",
        type: "status_changed",
        data: { from: "open", to: "in_progress" },
        createdAt: new Date(now + 60_000).toISOString(),
      }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.count).toBe(2);
  });
});

describe("groupConsecutiveAgentWorked", () => {
  it("merges consecutive agent_worked rows and sums stats", () => {
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
        activity({
          id: "s1",
          type: "status_changed",
          actorUserId: null,
          actorName: "Agent",
          data: { from: "in_progress", to: "in_review" },
          createdAt: new Date(now + 120_000).toISOString(),
        }),
      ]),
    );
    expect(grouped).toHaveLength(2);
    expect(grouped[0]!.activity.type).toBe("agent_worked");
    expect(grouped[0]!.children).toHaveLength(2);
    expect(grouped[0]!.activity.data).toMatchObject({
      durationMs: 8000,
      totalTokens: 3000,
    });
    expect(grouped[1]!.activity.type).toBe("status_changed");
  });
});

describe("buildBacksterosActivityTimeline", () => {
  it("returns newest-first after coalescing", () => {
    const now = Date.now();
    const timeline = buildBacksterosActivityTimeline([
      activity({
        id: "1",
        type: "created",
        data: {},
        createdAt: new Date(now).toISOString(),
      }),
      activity({
        id: "2",
        type: "status_changed",
        data: { from: "open", to: "in_progress" },
        createdAt: new Date(now + 1_000).toISOString(),
      }),
      activity({
        id: "3",
        type: "status_changed",
        data: { from: "in_progress", to: "in_review" },
        createdAt: new Date(now + 2_000).toISOString(),
      }),
    ]);
    expect(timeline).toHaveLength(2);
    expect(timeline[0]!.activity.type).toBe("status_changed");
    expect(timeline[0]!.activity.data).toMatchObject({
      from: "open",
      to: "in_review",
    });
    expect(timeline[1]!.activity.type).toBe("created");
  });
});
