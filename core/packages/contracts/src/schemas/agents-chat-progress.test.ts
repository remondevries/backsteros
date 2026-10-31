import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chatThreadMessageProgressSchema,
  createChatThreadMessageInputSchema,
  isChatThreadProgressTerminal,
  updateChatThreadMessageInputSchema,
} from "./agents-chat.js";

describe("chatThreadMessageProgressSchema", () => {
  it("accepts a running progress with steps and bar", () => {
    const parsed = chatThreadMessageProgressSchema.parse({
      title: "Publishing post",
      state: "running",
      current: 1,
      total: 3,
      detail: "Uploading media",
      steps: [
        { label: "Validate", state: "done" },
        { label: "Upload", state: "running" },
        { label: "Post", state: "pending" },
      ],
    });
    assert.equal(parsed.state, "running");
    assert.equal(parsed.steps?.length, 3);
  });

  it("rejects more than 20 steps", () => {
    assert.throws(() =>
      chatThreadMessageProgressSchema.parse({
        title: "Too many",
        state: "running",
        steps: Array.from({ length: 21 }, (_, i) => ({
          label: `Step ${i}`,
          state: "pending",
        })),
      }),
    );
  });

  it("rejects step labels over 80 chars", () => {
    assert.throws(() =>
      chatThreadMessageProgressSchema.parse({
        title: "Work",
        state: "running",
        steps: [{ label: "x".repeat(81), state: "pending" }],
      }),
    );
  });

  it("rejects current > total", () => {
    assert.throws(() =>
      chatThreadMessageProgressSchema.parse({
        title: "Work",
        state: "running",
        current: 4,
        total: 3,
      }),
    );
  });

  it("marks terminal states", () => {
    assert.equal(isChatThreadProgressTerminal("running"), false);
    assert.equal(isChatThreadProgressTerminal("succeeded"), true);
    assert.equal(isChatThreadProgressTerminal("failed"), true);
    assert.equal(isChatThreadProgressTerminal("canceled"), true);
  });
});

describe("createChatThreadMessageInputSchema with progress", () => {
  it("accepts body + progress", () => {
    const parsed = createChatThreadMessageInputSchema.parse({
      body: "Working on it",
      progress: {
        title: "Draft reply",
        state: "running",
        current: 0,
        total: 2,
      },
    });
    assert.equal(parsed.progress?.title, "Draft reply");
  });
});

describe("updateChatThreadMessageInputSchema", () => {
  it("requires progress or body", () => {
    assert.throws(() => updateChatThreadMessageInputSchema.parse({}));
  });

  it("accepts progress-only patch", () => {
    const parsed = updateChatThreadMessageInputSchema.parse({
      progress: { title: "Done", state: "succeeded" },
    });
    assert.equal(parsed.progress?.state, "succeeded");
  });
});
