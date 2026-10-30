import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  clearAgentShellChatMessageListeners,
  previewAgentChatMessageBody,
  publishAgentShellChatMessage,
  subscribeAgentShellChatMessage,
} from "./agent-shell-chat-events.js";

describe("agent-shell-chat-events", () => {
  beforeEach(() => {
    clearAgentShellChatMessageListeners();
  });

  it("previewAgentChatMessageBody flattens and truncates", () => {
    assert.equal(previewAgentChatMessageBody("  hi\nthere  "), "hi there");
    assert.equal(previewAgentChatMessageBody(""), "New message");
    const long = "x".repeat(120);
    const preview = previewAgentChatMessageBody(long, 96);
    assert.equal(preview.length, 96);
    assert.ok(preview.endsWith("…"));
  });

  it("publishes only to the matching workspace", () => {
    const hit: string[] = [];
    subscribeAgentShellChatMessage("ws_a", (event) => {
      hit.push(`a:${event.threadId}`);
    });
    subscribeAgentShellChatMessage("ws_b", (event) => {
      hit.push(`b:${event.threadId}`);
    });
    publishAgentShellChatMessage({
      workspaceId: "ws_a",
      threadId: "th_1",
      agentId: "ag_1",
      message: {
        id: "m_1",
        body: "hello",
        createdAt: "2026-10-30T12:00:00.000Z",
      },
    });
    assert.deepEqual(hit, ["a:th_1"]);
  });

  it("unsubscribe stops delivery", () => {
    let count = 0;
    const unsub = subscribeAgentShellChatMessage("ws_a", () => {
      count += 1;
    });
    unsub();
    publishAgentShellChatMessage({
      workspaceId: "ws_a",
      threadId: "th_1",
      agentId: "ag_1",
      message: {
        id: "m_1",
        body: "hello",
        createdAt: "2026-10-30T12:00:00.000Z",
      },
    });
    assert.equal(count, 0);
  });
});
