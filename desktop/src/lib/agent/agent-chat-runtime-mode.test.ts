import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cycleAgentChatAccessMode,
  normalizeAgentChatAccessMode,
  readAgentChatAccessMode,
} from "./agent-chat-runtime-mode.ts";

test("access mode defaults to supervised without browser storage", () => {
  assert.equal(readAgentChatAccessMode("any-task"), "supervised");
});

test("normalizeAgentChatAccessMode accepts three taxonomy modes", () => {
  assert.equal(normalizeAgentChatAccessMode("supervised"), "supervised");
  assert.equal(
    normalizeAgentChatAccessMode("auto_accept_edits"),
    "auto_accept_edits",
  );
  assert.equal(normalizeAgentChatAccessMode("full_access"), "full_access");
  assert.equal(normalizeAgentChatAccessMode("unknown"), "supervised");
  assert.equal(normalizeAgentChatAccessMode(null), "supervised");
});

test("cycleAgentChatAccessMode walks Supervised → Auto-accept edits → Full", () => {
  assert.equal(
    cycleAgentChatAccessMode("supervised"),
    "auto_accept_edits",
  );
  assert.equal(
    cycleAgentChatAccessMode("auto_accept_edits"),
    "full_access",
  );
  assert.equal(cycleAgentChatAccessMode("full_access"), "supervised");
});
