import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergeAgentChatTranscripts,
  repairInvertedUserAssistantPairs,
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

test("repairInvertedUserAssistantPairs swaps raced assistant-before-user", () => {
  const assistant: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "",
    createdAt: 10,
    activities: [
      { id: "t1", kind: "info", title: "Thinking", status: "in_progress" },
    ],
  };
  const user: AgentChatMessage = {
    id: "u1",
    role: "user",
    text: "Please fix",
    createdAt: 20,
  };
  const repaired = repairInvertedUserAssistantPairs([assistant, user]);
  assert.equal(repaired[0]?.id, "u1");
  assert.equal(repaired[1]?.id, "a1");
  assert.ok((repaired[1]?.createdAt ?? 0) > (repaired[0]?.createdAt ?? 0));
});

test("repairInvertedUserAssistantPairs leaves sealed assistant before user", () => {
  const assistant: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "Welcome.",
    createdAt: 10,
  };
  const user: AgentChatMessage = {
    id: "u1",
    role: "user",
    text: "Hi",
    createdAt: 20,
  };
  const repaired = repairInvertedUserAssistantPairs([assistant, user]);
  assert.equal(repaired[0]?.id, "a1");
  assert.equal(repaired[1]?.id, "u1");
});

test("repairInvertedUserAssistantPairs keeps follow-up user below prior agent turn", () => {
  const user1: AgentChatMessage = {
    id: "u1",
    role: "user",
    text: "First",
    createdAt: 10,
  };
  const assistant: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "",
    createdAt: 20,
    activities: [
      { id: "t1", kind: "tool", title: "Read", status: "in_progress" },
    ],
    segments: [
      { id: "s1", kind: "text", text: "Here is the answer." },
    ],
  };
  const user2: AgentChatMessage = {
    id: "u2",
    role: "user",
    text: "Thanks, next",
    createdAt: 30,
  };
  const repaired = repairInvertedUserAssistantPairs([user1, assistant, user2]);
  assert.deepEqual(
    repaired.map((message) => message.id),
    ["u1", "a1", "u2"],
  );
});

test("repairInvertedUserAssistantPairs does not rewrite mid-thread after fuzzy damage", () => {
  const sealed: AgentChatMessage = {
    id: "a-sealed",
    role: "assistant",
    text: "Prior reply",
    createdAt: 10,
  };
  const open: AgentChatMessage = {
    id: "a-open",
    role: "assistant",
    text: "",
    createdAt: 20,
    activities: [
      { id: "t1", kind: "thought", title: "Thinking", status: "in_progress" },
    ],
  };
  const followUp: AgentChatMessage = {
    id: "u-follow",
    role: "user",
    text: "are you done with this task?",
    createdAt: 30,
  };
  const orphanedBootstrap: AgentChatMessage = {
    id: "u-bootstrap",
    role: "user",
    text: "Implement this Backsteros task.",
    createdAt: 15,
  };
  const repaired = repairInvertedUserAssistantPairs([
    sealed,
    open,
    followUp,
    orphanedBootstrap,
  ]);
  assert.deepEqual(
    repaired.map((message) => message.id),
    ["a-sealed", "a-open", "u-follow", "u-bootstrap"],
  );
});

test("merge keeps repeated identical bootstrap user prompts distinct", () => {
  const bootstrap = "Implement this Backsteros task. ".repeat(8).trim();
  const remote: AgentChatMessage[] = [
    { id: "u1", role: "user", text: bootstrap, createdAt: 1 },
    { id: "a1", role: "assistant", text: "One", createdAt: 2 },
    { id: "u2", role: "user", text: bootstrap, createdAt: 3 },
    { id: "a2", role: "assistant", text: "Two", createdAt: 4 },
    { id: "u3", role: "user", text: bootstrap, createdAt: 5 },
    {
      id: "a3",
      role: "assistant",
      text: "",
      createdAt: 6,
      activities: [
        { id: "t1", kind: "thought", title: "Thinking", status: "in_progress" },
      ],
    },
    { id: "u4", role: "user", text: "are you done?", createdAt: 7 },
  ];
  const local = [...remote];
  const merged = mergeAgentChatTranscripts(remote, local);
  assert.deepEqual(
    merged.map((message) => message.id),
    ["u1", "a1", "u2", "a2", "u3", "a3", "u4"],
  );
});

test("merge keeps first-seen order and fuzzy-acks sidecar user ids", () => {
  const localUser: AgentChatMessage = {
    id: "local-u",
    role: "user",
    text: "Hi",
    createdAt: 50,
  };
  const remoteUser: AgentChatMessage = {
    id: "remote-u",
    role: "user",
    text: "Hi",
    createdAt: 55,
  };
  const assistant: AgentChatMessage = {
    id: "a1",
    role: "assistant",
    text: "Hello",
    createdAt: 60,
  };
  const merged = mergeAgentChatTranscripts(
    [remoteUser, assistant],
    [localUser, assistant],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.role, "user");
  assert.equal(merged[0]?.id, "remote-u");
  assert.equal(merged[1]?.role, "assistant");
});

test("merge does not collapse distinct repeated prompts outside fuzzy window", () => {
  const first: AgentChatMessage = {
    id: "u1",
    role: "user",
    text: "ok",
    createdAt: 1_000,
  };
  const second: AgentChatMessage = {
    id: "u2",
    role: "user",
    text: "ok",
    createdAt: 120_000,
  };
  const merged = mergeAgentChatTranscripts([first], [second]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.id, "u1");
  assert.equal(merged[1]?.id, "u2");
});
