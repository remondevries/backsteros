import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  answerChatThreadMessageChoicesInputSchema,
  chatThreadMessageChoicesSchema,
  chatThreadMessageSchema,
  createChatThreadMessageInputSchema,
} from "./agents-chat.js";

describe("chatThreadMessageChoicesSchema", () => {
  it("defaults value to label and multiSelect to false", () => {
    const parsed = chatThreadMessageChoicesSchema.parse({
      options: [{ label: "Yes" }, { label: "No", style: "danger" }],
    });
    assert.equal(parsed.multiSelect, false);
    assert.equal(parsed.options[0]?.value, "Yes");
    assert.equal(parsed.options[1]?.value, "No");
    assert.equal(parsed.options[1]?.style, "danger");
  });

  it("rejects fewer than 2 options", () => {
    assert.throws(() =>
      chatThreadMessageChoicesSchema.parse({
        options: [{ label: "Only" }],
      }),
    );
  });

  it("rejects more than 6 options", () => {
    assert.throws(() =>
      chatThreadMessageChoicesSchema.parse({
        options: Array.from({ length: 7 }, (_, i) => ({
          label: `Opt ${i}`,
        })),
      }),
    );
  });

  it("rejects oversized prompt / labels", () => {
    assert.throws(() =>
      chatThreadMessageChoicesSchema.parse({
        prompt: "x".repeat(201),
        options: [{ label: "A" }, { label: "B" }],
      }),
    );
    assert.throws(() =>
      chatThreadMessageChoicesSchema.parse({
        options: [{ label: "x".repeat(61) }, { label: "B" }],
      }),
    );
  });
});

describe("createChatThreadMessageInputSchema with choices", () => {
  it("accepts body + choices", () => {
    const parsed = createChatThreadMessageInputSchema.parse({
      body: "Pick one",
      choices: {
        prompt: "Continue?",
        options: [
          { label: "Ship", value: "ship", style: "primary" },
          { label: "Hold" },
        ],
      },
    });
    assert.equal(parsed.choices?.options[1]?.value, "Hold");
  });
});

describe("chatThreadMessageSchema choicesAnswer", () => {
  it("allows null choicesAnswer when choices present", () => {
    const parsed = chatThreadMessageSchema.parse({
      id: "m1",
      threadId: "t1",
      role: "assistant",
      authorContactId: null,
      authorName: "Sander",
      body: "Pick",
      status: "done",
      createdAt: "2026-10-31T08:00:00.000Z",
      updatedAt: "2026-10-31T08:00:00.000Z",
      choices: {
        multiSelect: false,
        options: [
          { label: "A", value: "a" },
          { label: "B", value: "b" },
        ],
      },
      choicesAnswer: null,
    });
    assert.equal(parsed.choicesAnswer, null);
  });
});

describe("answerChatThreadMessageChoicesInputSchema", () => {
  it("requires 1–6 values", () => {
    assert.deepEqual(
      answerChatThreadMessageChoicesInputSchema.parse({ values: ["ship"] }),
      { values: ["ship"] },
    );
    assert.throws(() =>
      answerChatThreadMessageChoicesInputSchema.parse({ values: [] }),
    );
  });
});
