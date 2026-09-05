import { describe, expect, it } from "vite-plus/test";

import { formatBacksterosActivityRelativeTime } from "./activityTime";
import {
  formatBacksterosActivityMessage,
  formatBacksterosTrackedDuration,
  getBacksterosTaskPriorityLabel,
} from "./taskDetailFormat";
import { getBacksterosTaskDisplayId } from "./types";

describe("task detail helpers", () => {
  it("formats display ids from project keys", () => {
    expect(getBacksterosTaskDisplayId({ number: 33, projectId: "p1" }, "BOD")).toBe("BOD-33");
    expect(getBacksterosTaskDisplayId({ number: 2 }, null)).toBe("IN-2");
  });

  it("formats priority and timer labels", () => {
    expect(getBacksterosTaskPriorityLabel(0)).toBe("No priority");
    expect(getBacksterosTaskPriorityLabel(1)).toBe("Urgent");
    expect(formatBacksterosTrackedDuration(3661)).toBe("01:01:01");
  });

  it("formats activity messages", () => {
    expect(
      formatBacksterosActivityMessage({
        id: "a1",
        taskId: "t1",
        type: "created",
        actorUserId: null,
        actorContactId: null,
        actorEmail: null,
        actorName: "Remon",
        data: {},
        createdAt: "2026-07-31T12:00:00.000Z",
      }),
    ).toBe("Remon created this task");

    expect(
      formatBacksterosActivityMessage({
        id: "a2",
        taskId: "t1",
        type: "assignee_changed",
        actorUserId: null,
        actorContactId: null,
        actorEmail: null,
        actorName: "Remon",
        data: { from: null, to: "c1", toName: "Remon de Vries" },
        createdAt: "2026-07-31T12:00:00.000Z",
      }),
    ).toBe("Remon assigned this task to Remon de Vries");

    expect(
      formatBacksterosActivityMessage({
        id: "a3",
        taskId: "t1",
        type: "timer_stopped",
        actorUserId: null,
        actorContactId: null,
        actorEmail: null,
        actorName: "Niels",
        data: { durationSeconds: 3 },
        createdAt: "2026-07-31T12:00:00.000Z",
      }),
    ).toBe("Niels tracked 00:00:03 on this task");
  });

  it("formats relative activity times", () => {
    const now = Date.now();
    expect(
      formatBacksterosActivityRelativeTime(new Date(now - 120_000).toISOString()),
    ).toBe("2m ago");
    expect(
      formatBacksterosActivityRelativeTime("2026-07-31T12:00:00.000Z"),
    ).toMatch(/Jul 31/);
  });
});
