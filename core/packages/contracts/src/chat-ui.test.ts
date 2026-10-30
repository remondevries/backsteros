import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chatUiMessageSchema,
  chatUiTaskCardDataSchema,
  chatUiThreadSchema,
} from "./chat-ui.js";

describe("chat-ui message format", () => {
  it("accepts a minimal user text message", () => {
    const parsed = chatUiMessageSchema.parse({
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    });
    assert.equal(parsed.status, "done");
    assert.equal(parsed.parts[0]?.type, "text");
  });

  it("accepts assistant parts used by agents", () => {
    const parsed = chatUiMessageSchema.parse({
      id: "m2",
      role: "assistant",
      author: { name: "Grok" },
      status: "streaming",
      createdAt: "2026-10-30T08:00:00.000Z",
      parts: [
        { type: "text", text: "Working…", markdown: true },
        {
          type: "tool-call",
          name: "search_tasks",
          input: { q: "chat" },
          status: "running",
        },
        {
          type: "card",
          cardType: "task",
          id: "card-1",
          data: { taskId: "t1", displayId: "BSH-1", title: "Chat UI" },
        },
        {
          type: "diff",
          filename: "a.ts",
          content: "--- a\n+++ b\n",
        },
        { type: "status-line", text: "Synced" },
        { type: "error", message: "timeout", code: "ETIMEDOUT" },
        {
          type: "approval-request",
          id: "apr-1",
          title: "Run deploy?",
        },
        {
          type: "file",
          url: "https://example.com/a.png",
          kind: "image",
          mimeType: "image/png",
        },
      ],
    });
    assert.equal(parsed.parts.length, 8);
    assert.equal(parsed.status, "streaming");
  });

  it("rejects unknown part types", () => {
    assert.throws(() =>
      chatUiMessageSchema.parse({
        id: "m3",
        role: "user",
        parts: [{ type: "unknown", text: "nope" }],
      }),
    );
  });

  it("parses a thread and task card data", () => {
    const thread = chatUiThreadSchema.parse({
      id: "th1",
      messages: [
        {
          id: "m1",
          role: "system",
          parts: [{ type: "status-line", text: "Conversation opened" }],
        },
      ],
    });
    assert.equal(thread.messages.length, 1);

    const card = chatUiTaskCardDataSchema.parse({
      taskId: "uuid",
      displayId: "BSH-3",
      href: "/tasks/uuid",
    });
    assert.equal(card.displayId, "BSH-3");
  });
});
