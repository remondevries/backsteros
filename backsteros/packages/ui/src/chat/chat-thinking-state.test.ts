import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHAT_THINKING_OFF,
  CHAT_THINKING_PROVISIONAL_MS,
  CHAT_THINKING_WORKING_STALE_MS,
  chatThinkingAfterSend,
  chatThinkingAfterStatus,
  chatThinkingFromPendingReplyAt,
  chatThinkingIsActive,
  chatThinkingRemainingMs,
} from "./chat-thinking-state.js";
import { thinkingStatusMessage } from "./agent-chat-message-adapter.js";

describe("chatThinkingState", () => {
  it("shows provisional thinking for 90s after send", () => {
    const now = 1_000_000;
    const state = chatThinkingAfterSend(now);
    assert.equal(state.mode, "provisional");
    assert.equal(state.label, null);
    assert.equal(chatThinkingIsActive(state, now), true);
    assert.equal(chatThinkingIsActive(state, now + CHAT_THINKING_PROVISIONAL_MS - 1), true);
    assert.equal(chatThinkingIsActive(state, now + CHAT_THINKING_PROVISIONAL_MS), false);
    assert.equal(
      chatThinkingRemainingMs(state, now),
      CHAT_THINKING_PROVISIONAL_MS,
    );
  });

  it("keeps working for 2 minutes then clears", () => {
    const now = 2_000_000;
    const state = chatThinkingAfterStatus("working", now, "Searching…");
    assert.equal(state.mode, "working");
    assert.equal(state.label, "Searching…");
    assert.equal(chatThinkingIsActive(state, now + CHAT_THINKING_WORKING_STALE_MS - 1), true);
    assert.equal(chatThinkingIsActive(state, now + CHAT_THINKING_WORKING_STALE_MS), false);
  });

  it("clears on idle", () => {
    assert.deepEqual(chatThinkingAfterStatus("idle", 0, "x"), CHAT_THINKING_OFF);
  });

  it("hydrates pendingReplyAt until stale and preserves label", () => {
    const now = Date.parse("2026-10-30T12:00:00.000Z");
    const fresh = new Date(now - 30_000).toISOString();
    const stale = new Date(now - CHAT_THINKING_WORKING_STALE_MS - 1).toISOString();
    assert.equal(chatThinkingFromPendingReplyAt(fresh, now).mode, "working");
    assert.equal(
      chatThinkingFromPendingReplyAt(fresh, now, "Drafting").label,
      "Drafting",
    );
    assert.equal(chatThinkingFromPendingReplyAt(stale, now).mode, "off");
    assert.equal(chatThinkingFromPendingReplyAt(null, now).mode, "off");
  });
});

describe("thinkingStatusMessage", () => {
  it("shows the step label instead of Thinking…", () => {
    const labeled = thinkingStatusMessage("Sander", { label: "Reading email…" });
    assert.deepEqual(labeled.parts, [
      { type: "status-line", text: "Reading email…" },
    ]);
    const fallback = thinkingStatusMessage("Sander", { label: "  " });
    assert.deepEqual(fallback.parts, [
      { type: "status-line", text: "Sander is thinking…" },
    ]);
  });
});
