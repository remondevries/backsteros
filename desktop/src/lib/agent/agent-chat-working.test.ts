import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveAgentChatWorking,
  resolveComposerPrimaryAction,
} from "./agent-chat-working.ts";

test("working is true for startingAgent while phase is idle", () => {
  assert.equal(
    resolveAgentChatWorking({
      turnPending: false,
      turnPhase: "idle",
      startingAgent: true,
      sendInFlight: false,
    }),
    true,
  );
});

test("working is true for sendInFlight while phase is idle", () => {
  assert.equal(
    resolveAgentChatWorking({
      turnPending: false,
      turnPhase: "idle",
      startingAgent: false,
      sendInFlight: true,
    }),
    true,
  );
});

test("working is true for turnPending or non-idle phase", () => {
  assert.equal(
    resolveAgentChatWorking({
      turnPending: true,
      turnPhase: "idle",
      startingAgent: false,
      sendInFlight: false,
    }),
    true,
  );
  assert.equal(
    resolveAgentChatWorking({
      turnPending: false,
      turnPhase: "thinking",
      startingAgent: false,
      sendInFlight: false,
    }),
    true,
  );
});

test("working is false when all send/turn signals are idle", () => {
  assert.equal(
    resolveAgentChatWorking({
      turnPending: false,
      turnPhase: "idle",
      startingAgent: false,
      sendInFlight: false,
    }),
    false,
  );
});

test("composer primary action: sending before running", () => {
  assert.equal(
    resolveComposerPrimaryAction({ sending: true, running: false }),
    "sending",
  );
  assert.equal(
    resolveComposerPrimaryAction({ sending: false, running: true }),
    "stop",
  );
  assert.equal(
    resolveComposerPrimaryAction({ sending: true, running: true }),
    "stop",
  );
  assert.equal(
    resolveComposerPrimaryAction({ sending: false, running: false }),
    "send",
  );
});
