import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatMessage } from "@backsteros/contracts";

import {
  createOptimisticOutgoingMessage,
  mergeChatMessageLists,
  mergeIncomingChatMessage,
  removeChatMessageById,
  replaceOptimisticChatMessage,
} from "./chat-message-merge.ts";

function msg(
  partial: Partial<ChatMessage> & Pick<ChatMessage, "id">,
): ChatMessage {
  return {
    conversationId: "c1",
    externalId: partial.id,
    direction: "outgoing",
    content: "hello",
    contentType: "text",
    senderName: "You",
    private: false,
    createdAt: "2026-10-22T12:00:00.000Z",
    ...partial,
  };
}

describe("chat-message-merge", () => {
  it("upgrades an optimistic bubble in place on content match", () => {
    const optimistic = createOptimisticOutgoingMessage({
      conversationId: "c1",
      content: "hi there",
    });
    const confirmed = msg({
      id: "server-1",
      content: "hi there",
      createdAt: "2026-10-22T12:00:01.000Z",
    });
    const merged = mergeIncomingChatMessage([optimistic], confirmed);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.id, optimistic.id);
    assert.equal(merged[0]!.externalId, "server-1");
    assert.equal(merged[0]!.createdAt, "2026-10-22T12:00:01.000Z");
  });

  it("keeps in-flight optimistic rows across a silent list reload", () => {
    const optimistic = createOptimisticOutgoingMessage({
      conversationId: "c1",
      content: "still sending",
    });
    const server = [
      msg({ id: "server-0", content: "earlier", direction: "incoming" }),
    ];
    const merged = mergeChatMessageLists([optimistic], server);
    assert.deepEqual(
      merged.map((row) => row.id),
      ["server-0", optimistic.id],
    );
  });

  it("drops optimistic rows once the server echo is present", () => {
    const optimistic = createOptimisticOutgoingMessage({
      conversationId: "c1",
      content: "done",
    });
    const server = [msg({ id: "server-1", content: "done" })];
    const merged = mergeChatMessageLists([optimistic], server);
    assert.deepEqual(merged, server);
  });

  it("replaces and removes optimistic ids", () => {
    const optimistic = createOptimisticOutgoingMessage({
      conversationId: "c1",
      content: "x",
    });
    const confirmed = msg({ id: "server-9", content: "x" });
    const replaced = replaceOptimisticChatMessage(
      [optimistic],
      optimistic.id,
      confirmed,
    );
    assert.equal(replaced[0]!.id, optimistic.id);
    assert.equal(replaced[0]!.externalId, "server-9");
    assert.deepEqual(removeChatMessageById(replaced, optimistic.id), []);
  });
});
