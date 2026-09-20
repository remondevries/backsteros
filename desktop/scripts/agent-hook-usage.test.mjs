import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAcpUsageAgentHookMessage,
  normalizeAgentHookUsage,
} from "./agent-hook-usage.mjs";

test("normalizeAgentHookUsage maps ACP context window fields", () => {
  const usage = normalizeAgentHookUsage({
    used: 12_000,
    size: 200_000,
  });
  assert.equal(usage?.usedTokens, 12_000);
  assert.equal(usage?.maxTokens, 200_000);
});

test("normalizeAgentHookUsage returns null for empty usage", () => {
  assert.equal(normalizeAgentHookUsage({}), null);
});

test("buildAcpUsageAgentHookMessage uses agent-hook fan-out shape", () => {
  const usage = normalizeAgentHookUsage({ usedTokens: 500, maxTokens: 128_000 });
  const message = buildAcpUsageAgentHookMessage(usage);
  assert.equal(message.type, "agent-hook");
  assert.equal(message.event, "usageUpdate");
  assert.equal(message.source, "acp");
  assert.equal(message.usage?.usedTokens, 500);
});
