import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeAcpModelId,
  resolveAcpModelForPrompt,
  shouldApplyAcpModelConfig,
} from "./agent-acp-model.mjs";

test("normalizeAcpModelId defaults empty to auto", () => {
  assert.equal(normalizeAcpModelId(null), "auto");
  assert.equal(normalizeAcpModelId("  "), "auto");
  assert.equal(normalizeAcpModelId("gpt-5.4"), "gpt-5.4");
});

test("shouldApplyAcpModelConfig skips auto", () => {
  assert.equal(shouldApplyAcpModelConfig("auto"), false);
  assert.equal(shouldApplyAcpModelConfig("gpt-5.4"), true);
});

test("resolveAcpModelForPrompt prefers session pin over requested", () => {
  assert.equal(
    resolveAcpModelForPrompt({
      sessionModelId: "composer-2",
      requestedModelId: "gpt-5.4",
    }),
    "composer-2",
  );
});

test("resolveAcpModelForPrompt uses requested when session unpinned", () => {
  assert.equal(
    resolveAcpModelForPrompt({
      sessionModelId: null,
      requestedModelId: "gpt-5.4",
    }),
    "gpt-5.4",
  );
});

test("resolveAcpModelForPrompt forceRequested overrides pin", () => {
  assert.equal(
    resolveAcpModelForPrompt({
      sessionModelId: "composer-2",
      requestedModelId: "gpt-5.4",
      forceRequested: true,
    }),
    "gpt-5.4",
  );
});
