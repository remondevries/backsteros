import { describe, expect, it } from "vitest";

import type { AgentChatActivityItem } from "./agent-acp-activity";
import {
  collectChangedFilesFromActivities,
  formatChatDuration,
  previousUserMessageCreatedAt,
  turnFoldLabel,
  turnWorkedLabel,
} from "./agent-chat-timeline";
import type { AgentChatMessage } from "./agent-chat-transcript";

describe("agent-chat-timeline", () => {
  it("formats durations", () => {
    expect(formatChatDuration(400)).toBe("<1s");
    expect(formatChatDuration(12_000)).toBe("12s");
    expect(formatChatDuration(65_000)).toBe("1m 5s");
    expect(formatChatDuration(3_600_000)).toBe("1h");
  });

  it("builds worked labels from duration or step count", () => {
    expect(
      turnWorkedLabel({
        startedAt: 1_000,
        endedAt: 13_000,
        activityCount: 4,
      }),
    ).toBe("Worked for 12s");
    expect(
      turnWorkedLabel({
        startedAt: null,
        endedAt: null,
        activityCount: 3,
      }),
    ).toBe("Worked · 3 steps");
  });

  it("builds interrupted fold labels like T3", () => {
    expect(
      turnFoldLabel({
        outcome: "interrupted",
        startedAt: 1_000,
        endedAt: 48_000,
        activityCount: 2,
      }),
    ).toBe("You stopped after 47s");
    expect(
      turnFoldLabel({
        outcome: "interrupted",
        startedAt: null,
        endedAt: null,
        activityCount: 2,
      }),
    ).toBe("You stopped this response");
  });

  it("collects unique changed files from edit tools", () => {
    const activities: AgentChatActivityItem[] = [
      {
        id: "1",
        kind: "tool",
        title: "Edited file",
        toolKind: "edit",
        detail: "src/a.ts",
        diff: {
          path: "src/a.ts",
          additions: 2,
          deletions: 1,
          lines: [],
        },
      },
      {
        id: "2",
        kind: "tool",
        title: "Read file",
        toolKind: "read",
        detail: "src/b.ts",
      },
      {
        id: "3",
        kind: "tool",
        title: "Edited file",
        toolKind: "edit",
        detail: "src/a.ts",
        diff: {
          path: "src/a.ts",
          additions: 1,
          deletions: 0,
          lines: [],
        },
      },
    ];
    expect(collectChangedFilesFromActivities(activities)).toEqual([
      {
        path: "src/a.ts",
        name: "a.ts",
        additions: 3,
        deletions: 1,
        lines: [],
      },
    ]);
  });

  it("finds previous user message timestamp", () => {
    const messages: AgentChatMessage[] = [
      { id: "u1", role: "user", text: "hi", createdAt: 10 },
      { id: "a1", role: "assistant", text: "yo", createdAt: 20 },
      { id: "u2", role: "user", text: "again", createdAt: 30 },
      { id: "a2", role: "assistant", text: "ok", createdAt: 40 },
    ];
    expect(previousUserMessageCreatedAt(messages, 3)).toBe(30);
    expect(previousUserMessageCreatedAt(messages, 1)).toBe(10);
  });
});
