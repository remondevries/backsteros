import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatUiMessage } from "@backsteros/contracts";

import { EMPTY_MENTION_CATALOG } from "../mentions/empty-catalog.js";
import type { MentionCatalog } from "../mentions/mention-menu-types.js";
import {
  chatMessageBubbleParts,
  collectChatTaskCardsBelow,
  taskCardPlainText,
  taskMentionTokensInText,
} from "./chat-task-mention-layout.js";
import { chatMessagePlainText } from "./chat-message-plain-text.js";

const TASK_CARD = {
  type: "card" as const,
  cardType: "task" as const,
  id: "card-1",
  data: {
    taskId: "task-uuid-153",
    displayId: "OS-153",
    title: "Chat task cards below bubble",
    description: "Lift cards out of the bubble.",
    status: "in_progress",
    priority: 2,
  },
};

const CATALOG: MentionCatalog = {
  ...EMPTY_MENTION_CATALOG,
  tasks: [
    {
      id: "task-uuid-153",
      displayId: "OS-153",
      title: "Chat task cards below bubble",
      status: "in_progress",
      priority: 2,
      dueDate: null,
      description: "From catalog",
      projectId: null,
      projectKey: null,
      projectName: "BacksterOS",
      projectIcon: "repo",
      contactKey: null,
    },
    {
      id: "task-uuid-12",
      displayId: "OS-12",
      title: "Older task",
      status: "triage",
      priority: 0,
      dueDate: null,
      description: null,
      projectId: null,
      projectKey: null,
      projectName: null,
      projectIcon: null,
      contactKey: null,
    },
  ],
};

function message(parts: ChatUiMessage["parts"]): ChatUiMessage {
  return {
    id: "m1",
    role: "assistant",
    status: "done",
    parts,
  };
}

describe("taskMentionTokensInText", () => {
  it("collects task mentions left-to-right and ignores other kinds", () => {
    const tokens = taskMentionTokensInText(
      "See [@task:OS-12] and [@project:BSH] then [@task:OS-153].",
    );
    assert.deepEqual(
      tokens.map((token) => token.displayId),
      ["OS-12", "OS-153"],
    );
  });
});

describe("chatMessageBubbleParts", () => {
  it("keeps text and non-task cards, lifts task cards out", () => {
    const parts = chatMessageBubbleParts([
      { type: "text", text: "Hi [@task:OS-153]", markdown: true },
      TASK_CARD,
      {
        type: "card",
        cardType: "project",
        id: "p1",
        data: { projectId: "p", key: "BSH", name: "BacksterOS" },
      },
    ]);
    assert.equal(parts.length, 2);
    assert.equal(parts[0]?.type, "text");
    assert.equal(parts[1]?.type, "card");
    if (parts[1]?.type === "card") {
      assert.equal(parts[1].cardType, "project");
    }
  });
});

describe("collectChatTaskCardsBelow", () => {
  it("orders unique tasks by first mention and prefers explicit card data", () => {
    const below = collectChatTaskCardsBelow(
      message([
        {
          type: "text",
          markdown: true,
          text: "Please check [@task:OS-153] and again [@task:OS-153]. Also [@task:OS-12].",
        },
        TASK_CARD,
      ]),
      CATALOG,
    );
    assert.deepEqual(
      below.map((entry) => entry.key),
      ["os-153", "os-12"],
    );
    assert.equal(below[0]?.part.id, "card-1");
    assert.equal(
      (below[0]?.part.data as { description?: string }).description,
      "Lift cards out of the bubble.",
    );
    assert.equal(
      (below[1]?.part.data as { title?: string }).title,
      "Older task",
    );
  });

  it("builds a card from the catalog when only a text mention is present", () => {
    const below = collectChatTaskCardsBelow(
      message([
        {
          type: "text",
          markdown: true,
          text: "[@task:OS-153] looks ready.",
        },
      ]),
      CATALOG,
    );
    assert.equal(below.length, 1);
    assert.equal(
      (below[0]?.part.data as { description?: string | null }).description,
      "From catalog",
    );
  });

  it("keeps card-only tasks when there is no text mention", () => {
    const below = collectChatTaskCardsBelow(message([TASK_CARD]), null);
    assert.equal(below.length, 1);
    assert.equal(below[0]?.part.id, "card-1");
  });

  it("skips unknown text mentions when the catalog has no match", () => {
    const below = collectChatTaskCardsBelow(
      message([
        {
          type: "text",
          text: "Missing [@task:ZZ-999]",
        },
      ]),
      CATALOG,
    );
    assert.equal(below.length, 0);
  });
});

describe("chatMessagePlainText with task cards", () => {
  it("copies raw text mentions and does not duplicate task cards", () => {
    assert.equal(
      chatMessagePlainText(
        message([
          {
            type: "text",
            text: "Looking at [@task:OS-153] now.",
          },
          TASK_CARD,
        ]),
      ),
      "Looking at [@task:OS-153] now.",
    );
  });

  it("emits [@task:…] when the only task signal is a card part", () => {
    assert.equal(
      chatMessagePlainText(message([TASK_CARD])),
      "[@task:OS-153]",
    );
  });
});

describe("taskCardPlainText", () => {
  it("formats a task card as a mention token", () => {
    assert.equal(taskCardPlainText(TASK_CARD), "[@task:OS-153]");
  });
});
