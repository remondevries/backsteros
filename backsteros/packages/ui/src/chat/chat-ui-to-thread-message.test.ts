import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatUiMessage } from "@backsteros/contracts";
import { fromThreadMessageLike } from "@assistant-ui/react";

import { buildChatUiDemoMessages } from "./chat-ui-demo-fixture.js";
import { chatUiMessageToThreadMessageLike } from "./chat-ui-to-thread-message.js";

const FALLBACK_STATUS = { type: "complete", reason: "stop" } as const;

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

  it("maps assistant pending status to running", () => {
    const like = chatUiMessageToThreadMessageLike({
      id: "p1",
      role: "assistant",
      status: "pending",
      parts: [{ type: "text", text: "…" }],
    });
    assert.equal(like.status?.type, "running");
    assert.equal(like.metadata?.isOptimistic, true);
  });

  it("omits status on user messages even when ChatUi status is set", () => {
    for (const status of ["pending", "done"] as const) {
      const like = chatUiMessageToThreadMessageLike({
        id: `u-${status}`,
        role: "user",
        status,
        parts: [{ type: "text", text: "hello" }],
      });
      assert.equal(like.role, "user");
      assert.equal(
        like.status,
        undefined,
        `user message must not carry ThreadMessageLike.status (was ${status})`,
      );
      // assistant-ui throws if status is present on non-assistant roles
      assert.doesNotThrow(() =>
        fromThreadMessageLike(like, like.id ?? "u", FALLBACK_STATUS),
      );
    }
  });

  it("omits status on system messages and uses a single text part", () => {
    const like = chatUiMessageToThreadMessageLike({
      id: "s1",
      role: "system",
      status: "done",
      parts: [{ type: "status-line", text: "Opened" }],
    });
    assert.equal(like.role, "system");
    assert.equal(like.status, undefined);
    assert.deepEqual(like.content, [{ type: "text", text: "Opened" }]);
    assert.doesNotThrow(() =>
      fromThreadMessageLike(like, like.id ?? "s", FALLBACK_STATUS),
    );
  });

  it("converts the /dev/chat-ui demo fixture without assistant-ui errors", () => {
    for (const message of buildChatUiDemoMessages()) {
      const like = chatUiMessageToThreadMessageLike(message);
      assert.doesNotThrow(
        () => fromThreadMessageLike(like, message.id, FALLBACK_STATUS),
        `demo message ${message.id} (${message.role}/${message.status})`,
      );
    }
  });
});
