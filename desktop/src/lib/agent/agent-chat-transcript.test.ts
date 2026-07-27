import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergeAgentChatTranscripts,
  type AgentChatMessage,
} from "./agent-chat-transcript.ts";

test("mergeAgentChatTranscripts keeps richer activity timeline", () => {
  const withActivities: AgentChatMessage = {
    id: "a-local",
    role: "assistant",
    text: "Done.",
    createdAt: 200,
    activities: [
      {
        id: "t1",
        kind: "tool",
        title: "Edited file",
        status: "completed",
        toolKind: "edit",
      },
    ],
  };
  const withoutActivities: AgentChatMessage = {
    id: "a-remote",
    role: "assistant",
    text: "Done.",
    createdAt: 210,
  };
  const user: AgentChatMessage = {
    id: "u1",
    role: "user",
    text: "Fix it",
    createdAt: 100,
  };

  const merged = mergeAgentChatTranscripts(
    [user, withoutActivities],
    [user, withActivities],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[1]?.text, "Done.");
  assert.equal(merged[1]?.activities?.length, 1);
  assert.equal(merged[1]?.activities?.[0]?.id, "t1");
});

test("mergeAgentChatTranscripts does not drop activities when remote is newer", () => {
  const olderWithActivities: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "Shipped.",
    createdAt: 100,
    activities: [
      { id: "t1", kind: "thought", title: "Thinking", status: "completed" },
    ],
  };
  const newerWithout: AgentChatMessage = {
    id: "a2",
    role: "assistant",
    text: "Shipped.",
    createdAt: 500,
  };

  const merged = mergeAgentChatTranscripts([newerWithout], [olderWithActivities]);
  assert.equal(merged[0]?.activities?.length, 1);
});
