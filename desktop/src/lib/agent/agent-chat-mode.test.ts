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

test("normalizeAgentChatMode maps aliases to build/plan/ask/debug", () => {
  assert.equal(normalizeAgentChatMode("build"), "build");
  assert.equal(normalizeAgentChatMode("agent"), "build");
  assert.equal(normalizeAgentChatMode("default"), "build");
  assert.equal(normalizeAgentChatMode("plan"), "plan");
  assert.equal(normalizeAgentChatMode("ask"), "ask");
  assert.equal(normalizeAgentChatMode("debug"), "debug");
  assert.equal(normalizeAgentChatMode("nope"), "build");
});

test("agentChatModeToCursorModeId maps UI modes to Cursor ACP ids", () => {
  assert.equal(agentChatModeToCursorModeId("build"), "agent");
  assert.equal(agentChatModeToCursorModeId("plan"), "plan");
  assert.equal(agentChatModeToCursorModeId("ask"), "ask");
  assert.equal(agentChatModeToCursorModeId("debug"), "debug");
});

test("cursorModeIdToAgentChatMode maps Cursor ids back to UI modes", () => {
  assert.equal(cursorModeIdToAgentChatMode("agent"), "build");
  assert.equal(cursorModeIdToAgentChatMode("plan"), "plan");
  assert.equal(cursorModeIdToAgentChatMode("ask"), "ask");
  assert.equal(cursorModeIdToAgentChatMode("debug"), "debug");
});

test("cycleAgentChatMode rotates Build → Plan → Ask → Debug", () => {
  assert.equal(cycleAgentChatMode("build"), "plan");
  assert.equal(cycleAgentChatMode("plan"), "ask");
  assert.equal(cycleAgentChatMode("ask"), "debug");
  assert.equal(cycleAgentChatMode("debug"), "build");
  assert.equal(cycleAgentChatMode("build", -1), "debug");
});

test("agentChatModeSlashCommand has no /agent (Build is default)", () => {
  assert.equal(agentChatModeSlashCommand("build"), null);
  assert.equal(agentChatModeSlashCommand("plan"), "/plan");
  assert.equal(agentChatModeSlashCommand("ask"), "/ask");
  assert.equal(agentChatModeSlashCommand("debug"), "/debug");
});

test("cursorModeSlashSequence covers toggles and Plan→Agent", () => {
  assert.deepEqual(cursorModeSlashSequence(null, "agent"), []);
  assert.deepEqual(cursorModeSlashSequence("agent", "ask"), ["/ask"]);
  assert.deepEqual(cursorModeSlashSequence("ask", "ask"), []);
  assert.deepEqual(cursorModeSlashSequence("ask", "agent"), ["/ask"]);
  assert.deepEqual(cursorModeSlashSequence("agent", "plan"), ["/plan"]);
  assert.deepEqual(cursorModeSlashSequence("plan", "agent"), ["/ask", "/ask"]);
  assert.deepEqual(cursorModeSlashSequence("debug", "agent"), ["/debug"]);
  assert.deepEqual(cursorModeSlashSequence("plan", "debug"), ["/debug"]);
});
