import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatConversation } from "@backsteros/contracts";

import {
  chatConversationToTaskItemRowTask,
  chatStatusToTaskStatus,
  groupChatConversationsByStatus,
  taskStatusToChatStatus,
} from "./chat-conversation-list-item.js";

function row(
  partial: Partial<ChatConversation> & Pick<ChatConversation, "id">,
): ChatConversation {
  return {
    externalId: partial.externalId ?? "12",
    inboxId: null,
    inboxName: "Website",
    channelType: "web",
    status: "open",
    contactName: "Ada Lovelace",
    contactEmail: "ada@example.com",
    contactPhone: null,
    contactAvatarUrl: null,
    lastMessagePreview: "Hello there",
    lastActivityAt: "2026-01-02T12:00:00.000Z",
    unread: false,
    assigneeId: null,
    priority: 0,
    dueDate: null,
    updatedAt: "2026-01-02T12:00:00.000Z",
    ...partial,
  };
}

describe("chatConversationToTaskItemRowTask", () => {
  it("maps visitor name, inbox, and open status to a task row", () => {
    const task = chatConversationToTaskItemRowTask(row({ id: "c1" }));
    assert.equal(task.title, "Ada Lovelace");
    assert.equal(task.projectName, "Website");
    assert.equal(task.status, "triage");
    assert.equal(task.support, true);
    assert.equal(task.number, 12);
  });

  it("maps chat statuses to task statuses both ways", () => {
    assert.equal(chatStatusToTaskStatus("open"), "triage");
    assert.equal(chatStatusToTaskStatus("pending"), "waiting");
    assert.equal(chatStatusToTaskStatus("snoozed"), "on_hold");
    assert.equal(chatStatusToTaskStatus("resolved"), "completed");
    assert.equal(taskStatusToChatStatus("completed"), "resolved");
    assert.equal(taskStatusToChatStatus("waiting"), "pending");
    assert.equal(taskStatusToChatStatus("on_hold"), "snoozed");
    assert.equal(taskStatusToChatStatus("backlog"), "snoozed");
    assert.equal(taskStatusToChatStatus("triage"), "open");
  });

  it("groups conversations by chat status", () => {
    const groups = groupChatConversationsByStatus([
      row({ id: "a", status: "open" }),
      row({ id: "b", status: "resolved", externalId: "3" }),
      row({ id: "c", status: "open", externalId: "4" }),
    ]);
    assert.deepEqual(
      groups.map((group) => [group.status, group.conversations.length]),
      [
        ["open", 2],
        ["resolved", 1],
      ],
    );
  });
});
