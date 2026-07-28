import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergeDisplayMessagesWithOptimisticUsers,
  pruneOptimisticUserMessages,
} from "./agent-chat-optimistic-user.ts";
import type { AgentChatMessage } from "./agent-chat-transcript.ts";

test("mergeDisplayMessagesWithOptimisticUsers appends pending users", () => {
  const messages: AgentChatMessage[] = [
    { id: "a1", role: "assistant", text: "Hi", createdAt: 1 },
  ];
  const optimistic: AgentChatMessage[] = [
    { id: "u1", role: "user", text: "Do it", createdAt: 2 },
  ];
  const display = mergeDisplayMessagesWithOptimisticUsers(
    messages,
    optimistic,
  );
  assert.equal(display.length, 2);
  assert.equal(display[1]?.id, "u1");
});

test("mergeDisplayMessagesWithOptimisticUsers skips acked ids", () => {
  const messages: AgentChatMessage[] = [
    { id: "u1", role: "user", text: "Do it", createdAt: 2 },
  ];
  const optimistic: AgentChatMessage[] = [
    { id: "u1", role: "user", text: "Do it", createdAt: 2 },
  ];
  const display = mergeDisplayMessagesWithOptimisticUsers(
    messages,
    optimistic,
  );
  assert.equal(display, messages);
});

test("pruneOptimisticUserMessages removes content-matched sidecar users", () => {
  const optimistic: AgentChatMessage[] = [
    { id: "local-u", role: "user", text: "Do it", createdAt: 100 },
  ];
  const messages: AgentChatMessage[] = [
    { id: "remote-u", role: "user", text: "Do it", createdAt: 105 },
  ];
  const pruned = pruneOptimisticUserMessages(optimistic, messages);
  assert.equal(pruned.length, 0);
});

test("duplicate optimistic prompts stay until each is acked", () => {
  const optimistic: AgentChatMessage[] = [
    { id: "u1", role: "user", text: "ok", createdAt: 100 },
    { id: "u2", role: "user", text: "ok", createdAt: 110 },
  ];
  const messages: AgentChatMessage[] = [
    { id: "remote-1", role: "user", text: "ok", createdAt: 102 },
  ];
  const display = mergeDisplayMessagesWithOptimisticUsers(
    messages,
    optimistic,
  );
  assert.equal(display.length, 2);
  assert.equal(display[1]?.id, "u2");
});
