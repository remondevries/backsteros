import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeAcpModelId,
  parseAcpPromptResponseUsage,
  parseAcpUsageUpdateFromSessionUpdate,
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

test("parseAcpUsageUpdateFromSessionUpdate accepts usage_update", () => {
  const usage = parseAcpUsageUpdateFromSessionUpdate({
    sessionUpdate: "usage_update",
    used: 42_000,
    size: 272_000,
  });
  assert.equal(usage?.usedTokens, 42_000);
  assert.equal(usage?.maxTokens, 272_000);
});

test("parseAcpUsageUpdateFromSessionUpdate drops empty zero-only updates", () => {
  assert.equal(
    parseAcpUsageUpdateFromSessionUpdate({
      sessionUpdate: "usage_update",
      used: 0,
    }),
    null,
  );
});

test("parseAcpPromptResponseUsage maps prompt turn usage", () => {
  const usage = parseAcpPromptResponseUsage({
    stopReason: "end_turn",
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
  });
  assert.equal(usage?.inputTokens, 100);
  assert.equal(usage?.outputTokens, 50);
  assert.equal(usage?.totalTokens, 150);
});

test("parseAcpPromptResponseUsage drops all-zero turn usage", () => {
  assert.equal(
    parseAcpPromptResponseUsage({
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    }),
    null,
  );
});
