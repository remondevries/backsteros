import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatUiCardPart, ChatUiMessage } from "@backsteros/contracts";

import { EMPTY_MENTION_CATALOG } from "../mentions/empty-catalog.js";
import type { MentionCatalog } from "../mentions/mention-menu-types.js";
import {
  chatMessageBubbleParts,
  collectChatMentionCardsBelow,
  collectChatTaskCardsBelow,
  hrefFromTaskDisplayId,
  mentionDedupeKey,
  stripBelowCardMentionsFromText,
  stripTaskMentionsFromText,
  taskCardPlainText,
  taskMentionTokensInText,
} from "./chat-mention-layout.js";
import { chatMessagePlainText } from "./chat-message-plain-text.js";
import { parseMentionToken } from "../mentions/mention-tokens.js";

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
  projects: [
    {
      id: "proj-os",
      key: "OS",
      name: "BacksterOS",
      color: null,
      icon: "repo",
      summary: "Ops system",
      status: "active",
      area: null,
    },
  ],
  letters: [
    {
      id: "letter-1",
      displayId: "L-12",
      title: "Welcome letter",
      status: "in_progress",
      dueDate: null,
      projectId: null,
      projectKey: "OS",
      projectName: "BacksterOS",
    },
  ],
  invoices: [
    {
      id: "inv-99",
      title: "Invoice 2026-99",
      invoiceNumber: "2026-99",
      state: "open",
      invoiceDate: "2026-01-01",
      dueDate: null,
      amountLabel: "120.00 EUR",
      contactName: "Acme",
      currency: "EUR",
    },
  ],
  contacts: [
    {
      id: "contact-1",
      key: "remon",
      number: 1,
      displayId: "C-1",
      name: "Remon",
      email: null,
      title: null,
      summary: null,
      avatarStorageKey: null,
      avatarUpdatedAt: 0,
      organizationId: null,
      organizationKey: null,
      organizationName: null,
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

describe("stripTaskMentionsFromText", () => {
  it("removes carded tokens, collapses whitespace, and drops a trailing colon", () => {
    assert.equal(
      stripTaskMentionsFromText("Here it is, Remon: [@task:OS-144]", new Set([
        "os-144",
      ])),
      "Here it is, Remon",
    );
  });

  it("keeps surrounding prose and non-task mentions", () => {
    assert.equal(
      stripTaskMentionsFromText(
        "See [@task:OS-12] and [@project:BSH] please.",
        new Set(["os-12"]),
      ),
      "See and [@project:BSH] please.",
    );
  });

  it("returns empty when the body was only a task mention", () => {
    assert.equal(
      stripTaskMentionsFromText("[@task:OS-153]", new Set(["os-153"])),
      "",
    );
  });

  it("drops empty paragraphs left behind by stripped mentions", () => {
    assert.equal(
      stripTaskMentionsFromText(
        "Intro\n\n[@task:OS-153]\n\nOutro",
        new Set(["os-153"]),
      ),
      "Intro\n\nOutro",
    );
  });

  it("leaves text alone when the display id is not in the strip set", () => {
    assert.equal(
      stripTaskMentionsFromText("Keep [@task:OS-12]", new Set(["os-999"])),
      "Keep [@task:OS-12]",
    );
  });
});

describe("stripBelowCardMentionsFromText", () => {
  it("strips project / letter / invoice tokens and keeps contact + organization inline", () => {
    assert.equal(
      stripBelowCardMentionsFromText(
        "Hi [@contact:remon] / [@organization:acme], see [@project:OS] + [@letter:L-12] + [@invoice:inv-99].",
        new Set(["project:os", "letter:l-12", "invoice:inv-99"]),
      ),
      "Hi [@contact:remon] / [@organization:acme], see + +.",
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
    // Project card is also lifted (all non-contact cards go below).
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.type, "text");
  });

  it("keeps explicit contact and organization cards inline in the bubble", () => {
    const parts = chatMessageBubbleParts([
      {
        type: "card",
        cardType: "contact",
        id: "c1",
        data: { contactId: "contact-1", name: "Remon" },
      },
      {
        type: "card",
        cardType: "organization",
        id: "o1",
        data: { organizationId: "org-1", key: "acme", name: "Acme" },
      },
    ]);
    assert.equal(parts.length, 2);
    assert.equal(parts[0]?.type, "card");
    assert.equal(parts[1]?.type, "card");
    if (parts[0]?.type === "card") {
      assert.equal(parts[0].cardType, "contact");
    }
    if (parts[1]?.type === "card") {
      assert.equal(parts[1].cardType, "organization");
    }
  });

  it("strips carded task tokens from bubble text", () => {
    const parts = chatMessageBubbleParts(
      [
        {
          type: "text",
          markdown: true,
          text: "Here it is, Remon: [@task:OS-144] — done.",
        },
      ],
      { stripTaskDisplayIds: new Set(["os-144"]) },
    );
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.type, "text");
    if (parts[0]?.type === "text") {
      assert.equal(parts[0].text, "Here it is, Remon: — done.");
    }
  });

  it("drops the bubble text part when only a mention remains", () => {
    const parts = chatMessageBubbleParts(
      [{ type: "text", text: "[@task:OS-153]", markdown: true }, TASK_CARD],
      { stripTaskDisplayIds: new Set(["os-153"]) },
    );
    assert.deepEqual(parts, []);
  });

  it("leaves contact tokens in the bubble when other kinds are stripped", () => {
    const parts = chatMessageBubbleParts(
      [
        {
          type: "text",
          text: "[@contact:remon] please review [@project:OS]",
        },
      ],
      { stripMentionKeys: new Set(["project:os"]) },
    );
    assert.equal(parts.length, 1);
    if (parts[0]?.type === "text") {
      assert.equal(parts[0].text, "[@contact:remon] please review");
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
      { catalog: CATALOG },
    );
    assert.deepEqual(
      below.map((entry) => entry.key),
      ["task:os-153", "task:os-12"],
    );
    assert.equal(below[0]?.unresolved, false);
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
      { catalog: CATALOG },
    );
    assert.equal(below.length, 1);
    assert.equal(below[0]?.unresolved, false);
    assert.equal(
      (below[0]?.part.data as { description?: string | null }).description,
      "From catalog",
    );
  });

  it("keeps card-only tasks when there is no text mention", () => {
    const below = collectChatTaskCardsBelow(message([TASK_CARD]), {
      catalog: null,
    });
    assert.equal(below.length, 1);
    assert.equal(below[0]?.part.id, "card-1");
    assert.equal(below[0]?.unresolved, false);
  });

  it("emits a looking-up stub when the catalog has no match", () => {
    const below = collectChatTaskCardsBelow(
      message([
        {
          type: "text",
          text: "Missing [@task:ZZ-999]",
        },
      ]),
      { catalog: CATALOG, lookingUp: true },
    );
    assert.equal(below.length, 1);
    assert.equal(below[0]?.unresolved, true);
    assert.equal(
      (below[0]?.part.data as { description?: string }).description,
      "Looking up…",
    );
    assert.equal(
      (below[0]?.part.data as { displayId?: string }).displayId,
      "ZZ-999",
    );
  });

  it("emits a not-found stub after lookup settles", () => {
    const below = collectChatTaskCardsBelow(
      message([{ type: "text", text: "[@task:ZZ-999]" }]),
      { catalog: CATALOG, lookingUp: false },
    );
    assert.equal(below[0]?.unresolved, true);
    assert.equal(
      (below[0]?.part.data as { description?: string }).description,
      "Task not found",
    );
  });

  it("prefers workspace resolvedByDisplayId over catalog stubs", () => {
    const resolved: ChatUiCardPart = {
      type: "card",
      cardType: "task",
      id: "ws-144",
      data: {
        taskId: "uuid-144",
        displayId: "OS-144",
        title: "Create new Support ticket from the + button",
        status: "completed",
      },
    };
    const below = collectChatTaskCardsBelow(
      message([
        {
          type: "text",
          text: "Here it is, Remon: [@task:OS-144] — done.",
        },
      ]),
      {
        catalog: EMPTY_MENTION_CATALOG,
        resolvedByDisplayId: new Map([["os-144", resolved]]),
      },
    );
    assert.equal(below.length, 1);
    assert.equal(below[0]?.unresolved, false);
    assert.equal(below[0]?.part.id, "ws-144");
    assert.equal(
      (below[0]?.part.data as { title?: string }).title,
      "Create new Support ticket from the + button",
    );
  });
});

describe("collectChatMentionCardsBelow", () => {
  it("resolves project, letter, and invoice cards from the catalog", () => {
    const below = collectChatMentionCardsBelow(
      message([
        {
          type: "text",
          text: "See [@project:OS], [@letter:L-12], and [@invoice:inv-99].",
        },
      ]),
      { catalog: CATALOG },
    );
    assert.deepEqual(
      below.map((entry) => entry.key),
      ["project:os", "letter:l-12", "invoice:inv-99"],
    );
    assert.equal(below.every((entry) => entry.unresolved === false), true);
    assert.equal(below[0]?.part.cardType, "project");
    assert.equal(below[1]?.part.cardType, "letter");
    assert.equal(below[2]?.part.cardType, "invoice");
    assert.equal(
      (below[0]?.part.data as { name?: string }).name,
      "BacksterOS",
    );
    assert.equal(
      (below[1]?.part.data as { title?: string }).title,
      "Welcome letter",
    );
    assert.equal(
      (below[2]?.part.data as { invoiceNumber?: string | null }).invoiceNumber,
      "2026-99",
    );
  });

  it("never collects contact or organization mentions as below-cards", () => {
    const below = collectChatMentionCardsBelow(
      message([
        {
          type: "text",
          text: "Ping [@contact:remon] / [@organization:acme] about [@task:OS-153].",
        },
      ]),
      { catalog: CATALOG },
    );
    assert.deepEqual(
      below.map((entry) => entry.key),
      ["task:os-153"],
    );
  });

  it("dedupes mixed kinds in first-seen order", () => {
    const below = collectChatMentionCardsBelow(
      message([
        {
          type: "text",
          text: "[@project:OS] then [@task:OS-12] then [@project:OS] again.",
        },
      ]),
      { catalog: CATALOG },
    );
    assert.deepEqual(
      below.map((entry) => entry.key),
      ["project:os", "task:os-12"],
    );
  });
});

describe("mentionDedupeKey", () => {
  it("returns null for contacts and organizations", () => {
    const contact = parseMentionToken("[@contact:remon]");
    const organization = parseMentionToken("[@organization:acme]");
    assert.ok(contact);
    assert.ok(organization);
    assert.equal(mentionDedupeKey(contact!), null);
    assert.equal(mentionDedupeKey(organization!), null);
  });
});

describe("hrefFromTaskDisplayId", () => {
  it("builds a project task href from OS-144", () => {
    const href = hrefFromTaskDisplayId("OS-144");
    assert.ok(href);
    assert.match(href!, /\/projects\/OS\/tasks\//i);
    assert.match(href!, /144/);
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

  it("keeps contact mention tokens in copied raw text", () => {
    assert.equal(
      chatMessagePlainText(
        message([
          {
            type: "text",
            text: "Hi [@contact:remon], see [@project:OS].",
          },
        ]),
      ),
      "Hi [@contact:remon], see [@project:OS].",
    );
  });
});

describe("taskCardPlainText", () => {
  it("formats a task card as a mention token", () => {
    assert.equal(taskCardPlainText(TASK_CARD), "[@task:OS-153]");
  });
});
