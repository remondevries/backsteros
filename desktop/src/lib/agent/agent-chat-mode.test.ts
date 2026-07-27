import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agentChatModeSlashCommand,
  agentChatModeToCursorModeId,
  cursorModeIdToAgentChatMode,
  cursorModeSlashSequence,
  cycleAgentChatMode,
  normalizeAgentChatMode,
} from "./agent-chat-mode.ts";

test("normalizeAgentChatMode maps aliases to build/plan/ask", () => {
  assert.equal(normalizeAgentChatMode("build"), "build");
  assert.equal(normalizeAgentChatMode("agent"), "build");
  assert.equal(normalizeAgentChatMode("default"), "build");
  assert.equal(normalizeAgentChatMode("plan"), "plan");
  assert.equal(normalizeAgentChatMode("ask"), "ask");
  // Cursor ACP rejects debug — fall back to build.
  assert.equal(normalizeAgentChatMode("debug"), "build");
  assert.equal(normalizeAgentChatMode("nope"), "build");
});

test("agentChatModeToCursorModeId maps UI modes to Cursor ACP ids", () => {
  assert.equal(agentChatModeToCursorModeId("build"), "agent");
  assert.equal(agentChatModeToCursorModeId("plan"), "plan");
  assert.equal(agentChatModeToCursorModeId("ask"), "ask");
});

test("cursorModeIdToAgentChatMode maps Cursor ids back to UI modes", () => {
  assert.equal(cursorModeIdToAgentChatMode("agent"), "build");
  assert.equal(cursorModeIdToAgentChatMode("plan"), "plan");
  assert.equal(cursorModeIdToAgentChatMode("ask"), "ask");
});

test("cycleAgentChatMode rotates Build → Plan → Ask", () => {
  assert.equal(cycleAgentChatMode("build"), "plan");
  assert.equal(cycleAgentChatMode("plan"), "ask");
  assert.equal(cycleAgentChatMode("ask"), "build");
  assert.equal(cycleAgentChatMode("build", -1), "ask");
});

test("agentChatModeSlashCommand has no /agent (Build is default)", () => {
  assert.equal(agentChatModeSlashCommand("build"), null);
  assert.equal(agentChatModeSlashCommand("plan"), "/plan");
  assert.equal(agentChatModeSlashCommand("ask"), "/ask");
});

test("cursorModeSlashSequence covers toggles and Plan→Agent", () => {
  assert.deepEqual(cursorModeSlashSequence(null, "agent"), []);
  assert.deepEqual(cursorModeSlashSequence("agent", "ask"), ["/ask"]);
  assert.deepEqual(cursorModeSlashSequence("ask", "ask"), []);
  assert.deepEqual(cursorModeSlashSequence("ask", "agent"), ["/ask"]);
  assert.deepEqual(cursorModeSlashSequence("agent", "plan"), ["/plan"]);
  assert.deepEqual(cursorModeSlashSequence("plan", "agent"), ["/ask", "/ask"]);
});
