import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatUiMessage } from "@backsteros/contracts";

import { chatUiMessageToThreadMessageLike } from "./chat-ui-to-thread-message.js";

describe("chat-ui-to-thread-message", () => {
  it("maps text + tool-call + card into ThreadMessageLike", () => {
    const message: ChatUiMessage = {
      id: "m1",
      role: "assistant",
      status: "done",
      parts: [
        { type: "text", text: "hi" },
        {
          type: "tool-call",
          name: "echo",
          input: { x: 1 },
          output: { y: 2 },
          status: "done",
        },
        {
          type: "card",
          cardType: "task",
          id: "c1",
          data: { taskId: "t1" },
        },
      ],
    };
    const like = chatUiMessageToThreadMessageLike(message);
    assert.equal(like.id, "m1");
    assert.equal(like.role, "assistant");
    assert.ok(Array.isArray(like.content));
    const content = like.content as readonly { type: string }[];
    assert.equal(content[0]?.type, "text");
    assert.equal(content[1]?.type, "tool-call");
    assert.equal(content[2]?.type, "data-card");
    assert.equal(
      (like.metadata?.custom as { chatUi?: ChatUiMessage } | undefined)?.chatUi
        ?.id,
      "m1",
    );
  });

  it("maps pending status to running", () => {
    const like = chatUiMessageToThreadMessageLike({
      id: "p1",
      role: "user",
      status: "pending",
      parts: [{ type: "text", text: "…" }],
    });
    assert.equal(like.status?.type, "running");
    assert.equal(like.metadata?.isOptimistic, true);
  });
});
