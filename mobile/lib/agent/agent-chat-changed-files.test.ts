import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectChangedFilesFromActivities,
  latestAgentChatChangedFiles,
  latestAgentChatPlan,
} from "./agent-chat-changed-files.ts";
import { mergeTranscriptMessages } from "./agent-chat-transcript-merge.ts";
import type { AgentChatMessage } from "./agent-chat-message.ts";

describe("collectChangedFilesFromActivities", () => {
  it("merges edit tool diffs by path", () => {
    const files = collectChangedFilesFromActivities([
      {
        id: "1",
        kind: "tool",
        title: "Edit",
        toolKind: "edit",
        diff: {
          path: "src/a.ts",
          additions: 2,
          deletions: 1,
          lines: [
            { type: "del", text: "old" },
            { type: "add", text: "new" },
          ],
        },
      },
      {
        id: "2",
        kind: "tool",
        title: "Edit again",
        toolKind: "edit",
        diff: {
          path: "src/a.ts",
          additions: 1,
          deletions: 0,
          lines: [{ type: "add", text: "more" }],
        },
      },
    ]);
    assert.equal(files.length, 1);
    assert.equal(files[0]?.path, "src/a.ts");
    assert.equal(files[0]?.additions, 3);
    assert.equal(files[0]?.deletions, 1);
    assert.ok((files[0]?.lines.length ?? 0) > 2);
  });

  it("skips path-only edits without lines or stats", () => {
    const files = collectChangedFilesFromActivities([
      {
        id: "1",
        kind: "tool",
        title: "Edit",
        toolKind: "edit",
        detail: "src/a.ts",
      },
    ]);
    assert.equal(files.length, 0);
  });
});

describe("latestAgentChatChangedFiles", () => {
  it("prefers the most recent assistant turn with files", () => {
    const messages: AgentChatMessage[] = [
      {
        id: "u1",
        role: "user",
        text: "hi",
        createdAt: 1,
      },
      {
        id: "a1",
        role: "assistant",
        text: "done",
        createdAt: 2,
        activities: [
          {
            id: "t1",
            kind: "tool",
            title: "Edit",
            toolKind: "edit",
            diff: {
              path: "old.ts",
              additions: 1,
              deletions: 0,
              lines: [{ type: "add", text: "x" }],
            },
          },
        ],
      },
      {
        id: "u2",
        role: "user",
        text: "again",
        createdAt: 3,
      },
      {
        id: "a2",
        role: "assistant",
        text: "ok",
        createdAt: 4,
        activities: [
          {
            id: "t2",
            kind: "tool",
            title: "Edit",
            toolKind: "edit",
            diff: {
              path: "new.ts",
              additions: 2,
              deletions: 0,
              lines: [{ type: "add", text: "y" }],
            },
          },
        ],
      },
    ];
    const files = latestAgentChatChangedFiles(messages);
    assert.equal(files.length, 1);
    assert.equal(files[0]?.path, "new.ts");
  });
});

describe("latestAgentChatPlan", () => {
  it("returns the latest plan payload", () => {
    const messages: AgentChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        text: "",
        createdAt: 1,
        proposedPlanMarkdown: "# Old",
        planSteps: [{ step: "A", status: "pending" }],
      },
      {
        id: "a2",
        role: "assistant",
        text: "",
        createdAt: 2,
        proposedPlanMarkdown: "# New",
        planSteps: [{ step: "B", status: "inProgress" }],
      },
    ];
    const plan = latestAgentChatPlan(messages);
    assert.equal(plan.proposedPlanMarkdown, "# New");
    assert.equal(plan.planSteps[0]?.step, "B");
  });
});

describe("mergeTranscriptMessages", () => {
  it("keeps richer activities when merging by id", () => {
    const rich: AgentChatMessage = {
      id: "a1",
      role: "assistant",
      text: "hello",
      createdAt: 10,
      activities: [
        {
          id: "t1",
          kind: "tool",
          title: "Edit",
          toolKind: "edit",
          diff: {
            path: "a.ts",
            additions: 1,
            deletions: 0,
            lines: [{ type: "add", text: "x" }],
          },
        },
      ],
    };
    const plain: AgentChatMessage = {
      id: "a1",
      role: "assistant",
      text: "hello",
      createdAt: 12,
    };
    const merged = mergeTranscriptMessages([plain], [rich]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.activities?.length, 1);
    assert.equal(merged[0]?.createdAt, 12);
  });
});
