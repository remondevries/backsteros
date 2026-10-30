import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage } from "@backsteros/contracts";

import {
  chatMessageToChatUiMessage,
  chatMessagesToChatUiMessages,
} from "./messages-chat-ui-adapter.js";

function msg(
  partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "direction" | "content">,
): ChatMessage {
  return {
    conversationId: "c1",
    externalId: partial.id,
    contentType: "text",
    senderName: null,
    private: false,
    createdAt: "2026-10-30T08:00:00.000Z",
    ...partial,
  };
}

describe("messages-chat-ui-adapter", () => {
  it("maps incoming to user text", () => {
    const ui = chatMessageToChatUiMessage(
      msg({
        id: "1",
        direction: "incoming",
        content: "Hi",
        senderName: "Ada",
      }),
    );
    assert.equal(ui.role, "user");
    assert.equal(ui.author?.name, "Ada");
    assert.deepEqual(ui.parts, [{ type: "text", text: "Hi" }]);
    assert.equal(ui.status, "done");
  });

  it("maps outgoing to assistant and optimistic to pending", () => {
    const ui = chatMessageToChatUiMessage(
      msg({
        id: "local-abc",
        direction: "outgoing",
        content: "Sending",
      }),
    );
    assert.equal(ui.role, "assistant");
    assert.equal(ui.status, "pending");
  });

  it("maps activity to system status-line", () => {
    const ui = chatMessageToChatUiMessage(
      msg({
        id: "a1",
        direction: "activity",
        content: "Assigned to Remon",
      }),
    );
    assert.equal(ui.role, "system");
    assert.deepEqual(ui.parts, [
      { type: "status-line", text: "Assigned to Remon" },
    ]);
  });

  it("uses private-note fallback when content empty", () => {
    const ui = chatMessageToChatUiMessage(
      msg({
        id: "n1",
        direction: "outgoing",
        content: "",
        private: true,
      }),
    );
    assert.deepEqual(ui.parts, [{ type: "text", text: "(private note)" }]);
  });

  it("maps a list preserving order", () => {
    const list = chatMessagesToChatUiMessages([
      msg({ id: "1", direction: "incoming", content: "a" }),
      msg({ id: "2", direction: "outgoing", content: "b" }),
    ]);
    assert.deepEqual(
      list.map((m) => m.id),
      ["1", "2"],
    );
  });
});
