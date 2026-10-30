import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHAT_THREAD_STATUS_LABEL_MAX,
  sanitizeChatThreadStatusLabel,
  updateChatThreadAgentStatusInputSchema,
} from "./agents-chat.js";

describe("sanitizeChatThreadStatusLabel", () => {
  it("trims, collapses whitespace, strips controls, and caps length", () => {
    assert.equal(sanitizeChatThreadStatusLabel("  Reading  docs  "), "Reading docs");
    assert.equal(sanitizeChatThreadStatusLabel("a\nb\tc"), "a b c");
    assert.equal(sanitizeChatThreadStatusLabel("hi\u0000there"), "hithere");
    assert.equal(
      sanitizeChatThreadStatusLabel("x".repeat(CHAT_THREAD_STATUS_LABEL_MAX + 10))
        ?.length,
      CHAT_THREAD_STATUS_LABEL_MAX,
    );
    assert.equal(sanitizeChatThreadStatusLabel("   "), null);
    assert.equal(sanitizeChatThreadStatusLabel(null), null);
  });
});

describe("updateChatThreadAgentStatusInputSchema", () => {
  it("accepts working with an optional label", () => {
    const parsed = updateChatThreadAgentStatusInputSchema.parse({
      state: "working",
      label: "  Searching inbox…  ",
    });
    assert.deepEqual(parsed, {
      state: "working",
      label: "Searching inbox…",
    });
  });

  it("defaults label to null when omitted on working", () => {
    assert.deepEqual(
      updateChatThreadAgentStatusInputSchema.parse({ state: "working" }),
      { state: "working", label: null },
    );
  });

  it("clears label on idle even if provided", () => {
    assert.deepEqual(
      updateChatThreadAgentStatusInputSchema.parse({
        state: "idle",
        label: "should ignore",
      }),
      { state: "idle", label: null },
    );
  });
});
