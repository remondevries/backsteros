import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeAgentChatModelId,
  readAgentChatModelId,
  resolveEffectiveAgentChatModelId,
} from "./agent-chat-model.ts";

test("access model defaults to auto without browser storage", () => {
  assert.equal(readAgentChatModelId(), "auto");
});

test("normalizeAgentChatModelId defaults empty to auto", () => {
  assert.equal(normalizeAgentChatModelId(null), "auto");
  assert.equal(normalizeAgentChatModelId("  "), "auto");
  assert.equal(normalizeAgentChatModelId("gpt-5.4"), "gpt-5.4");
});

test("resolveEffectiveAgentChatModelId prefers session pin", () => {
  assert.equal(
    resolveEffectiveAgentChatModelId({
      sessionModelId: "composer-2",
      globalModelId: "gpt-5.4",
    }),
    "composer-2",
  );
});

test("resolveEffectiveAgentChatModelId falls back to global", () => {
  assert.equal(
    resolveEffectiveAgentChatModelId({
      sessionModelId: null,
      globalModelId: "gpt-5.4",
    }),
    "gpt-5.4",
  );
});
