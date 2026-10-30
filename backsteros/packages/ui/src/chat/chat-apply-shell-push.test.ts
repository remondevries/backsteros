import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatUiMessage } from "@backsteros/contracts";

import { applyAssistantShellChatPush } from "./chat-apply-shell-push.js";

function msg(
  partial: Partial<ChatUiMessage> & Pick<ChatUiMessage, "id" | "role">,
): ChatUiMessage {
  return {
    author: { name: "x" },
    status: "done",
    createdAt: "2026-10-30T21:00:00.000Z",
    parts: [{ type: "text", text: "hi" }],
    ...partial,
  };
}

describe("applyAssistantShellChatPush", () => {
  it("appends the assistant reply and clears thinking", () => {
    const previous = [
      msg({ id: "u1", role: "user" }),
      msg({
        id: "thinking-sander",
        role: "system",
        parts: [{ type: "status-line", text: "Sander is thinking…" }],
      }),
    ];
    const next = applyAssistantShellChatPush(
      previous,
      {
        id: "a1",
        body: "Got it",
        createdAt: "2026-10-30T21:01:00.000Z",
      },
      "Sander",
    );
    assert.equal(next.length, 2);
    assert.equal(next[0]?.id, "u1");
    assert.equal(next[1]?.id, "a1");
    assert.equal(next[1]?.role, "assistant");
    assert.equal(next[1]?.author?.name, "Sander");
    assert.deepEqual(next[1]?.parts, [
      { type: "text", text: "Got it", markdown: true },
    ]);
  });

  it("is idempotent for the same message id", () => {
    const previous = [
      msg({
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Got it", markdown: true }],
      }),
    ];
    const next = applyAssistantShellChatPush(
      previous,
      { id: "a1", body: "Got it again", createdAt: "2026-10-30T21:02:00.000Z" },
      "Sander",
    );
    assert.equal(next.length, 1);
    assert.deepEqual(next[0]?.parts, [
      { type: "text", text: "Got it", markdown: true },
    ]);
  });
});
