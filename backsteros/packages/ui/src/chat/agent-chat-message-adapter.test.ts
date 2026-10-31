import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatThreadMessage } from "@backsteros/contracts";

import {
  chatThreadMessageToUi,
  chatThreadMessagesToUi,
  withChoicesDismissedStates,
} from "./agent-chat-message-adapter.js";

function assistantWithChoices(
  id: string,
  answered: boolean,
): ChatThreadMessage {
  return {
    id,
    threadId: "th",
    role: "assistant",
    authorContactId: null,
    authorName: "Sander",
    body: "Pick a path",
    status: "done",
    createdAt: "2026-10-31T08:00:00.000Z",
    updatedAt: "2026-10-31T08:00:00.000Z",
    choices: {
      multiSelect: false,
      options: [
        { label: "Ship", value: "ship", style: "primary" },
        { label: "Hold", value: "hold" },
      ],
    },
    choicesAnswer: answered
      ? { values: ["ship"], answeredAt: "2026-10-31T08:01:00.000Z" }
      : null,
  };
}

describe("chatThreadMessageToUi attachments + link previews", () => {
  it("appends attachment and link-preview cards below the bubble", () => {
    const ui = chatThreadMessageToUi({
      id: "m-att",
      threadId: "th",
      role: "user",
      authorContactId: null,
      authorName: "Remon",
      body: "See https://example.com",
      status: "done",
      createdAt: "2026-10-31T08:00:00.000Z",
      updatedAt: "2026-10-31T08:00:00.000Z",
      attachments: [
        {
          id: "a1",
          filename: "shot.png",
          mime: "image/png",
          size: 12,
          url: "/api/v1/chat/threads/th/attachments/a1",
          thumbnailUrl: "/api/v1/chat/threads/th/attachments/a1",
          kind: "image",
        },
      ],
      linkPreviews: [
        {
          url: "https://example.com",
          siteName: "Example",
          title: "Example Site",
          description: "Hello",
          faviconUrl: null,
          imageUrl: null,
        },
      ],
    });
    assert.equal(ui.parts[0]?.type, "text");
    assert.equal(
      ui.parts.some(
        (part) => part.type === "card" && part.cardType === "attachments",
      ),
      true,
    );
    assert.equal(
      ui.parts.some(
        (part) => part.type === "card" && part.cardType === "link-previews",
      ),
      true,
    );
  });
});

describe("chatThreadMessageToUi progress", () => {
  it("keeps body copy and appends a progress card", () => {
    const ui = chatThreadMessageToUi({
      id: "m-prog",
      threadId: "t1",
      role: "assistant",
      authorContactId: null,
      authorName: "Sander",
      body: "Working…",
      status: "done",
      createdAt: "2026-10-31T10:00:00.000Z",
      updatedAt: "2026-10-31T10:00:05.000Z",
      progress: {
        title: "Draft",
        state: "running",
        current: 1,
        total: 2,
        steps: [
          { label: "Outline", state: "done" },
          { label: "Write", state: "running" },
        ],
      },
    });
    assert.equal(ui.parts[0]?.type, "text");
    const card = ui.parts.find(
      (part) => part.type === "card" && part.cardType === "progress",
    );
    assert.ok(card && card.type === "card");
    assert.equal(card.cardType, "progress");
    assert.equal((card.data as { title?: string }).title, "Draft");
  });
});

describe("chatThreadMessageToUi choices", () => {
  it("keeps body copy and appends a choices card", () => {
    const ui = chatThreadMessageToUi(assistantWithChoices("m1", false));
    assert.equal(ui.parts[0]?.type, "text");
    if (ui.parts[0]?.type === "text") {
      assert.equal(ui.parts[0].text, "Pick a path");
    }
    assert.equal(ui.parts[1]?.type, "card");
    if (ui.parts[1]?.type === "card") {
      assert.equal(ui.parts[1].cardType, "choices");
      assert.equal(
        (ui.parts[1].data as { answer: unknown }).answer,
        null,
      );
    }
  });

  it("marks unanswered choices dismissed after a later user message", () => {
    const ui = chatThreadMessagesToUi([
      assistantWithChoices("m1", false),
      {
        id: "m2",
        threadId: "th",
        role: "user",
        authorContactId: null,
        authorName: "Remon",
        body: "typed instead",
        status: "done",
        createdAt: "2026-10-31T08:02:00.000Z",
        updatedAt: "2026-10-31T08:02:00.000Z",
      },
    ]);
    const card = ui[0]?.parts.find(
      (part) => part.type === "card" && part.cardType === "choices",
    );
    assert.ok(card && card.type === "card");
    assert.equal((card.data as { dismissed?: boolean }).dismissed, true);
  });

  it("does not dismiss answered choices", () => {
    const ui = chatThreadMessagesToUi([
      assistantWithChoices("m1", true),
      {
        id: "m2",
        threadId: "th",
        role: "user",
        authorContactId: null,
        authorName: "Remon",
        body: "ship",
        status: "done",
        createdAt: "2026-10-31T08:02:00.000Z",
        updatedAt: "2026-10-31T08:02:00.000Z",
      },
    ]);
    const card = ui[0]?.parts.find(
      (part) => part.type === "card" && part.cardType === "choices",
    );
    assert.ok(card && card.type === "card");
    assert.notEqual((card.data as { dismissed?: boolean }).dismissed, true);
  });

  it("recomputes dismissed after a local send", () => {
    const open = chatThreadMessageToUi(assistantWithChoices("m1", false));
    const after = withChoicesDismissedStates([
      open,
      {
        id: "m2",
        role: "user",
        status: "done",
        createdAt: "2026-10-31T08:03:00.000Z",
        parts: [{ type: "text", text: "hello" }],
      },
    ]);
    const card = after[0]?.parts.find(
      (part) => part.type === "card" && part.cardType === "choices",
    );
    assert.ok(card && card.type === "card");
    assert.equal((card.data as { dismissed?: boolean }).dismissed, true);
  });
});
