import assert from "node:assert/strict";
import { test } from "node:test";

import { agentHookMessageFromAcpUsageEvent } from "./agent-acp-usage-forward.mjs";

test("forwards valid usage-update to agent-hook usageUpdate", () => {
  const message = agentHookMessageFromAcpUsageEvent({
    type: "usage-update",
    usage: { usedTokens: 10_000, maxTokens: 200_000 },
  });
  assert.equal(message?.type, "agent-hook");
  assert.equal(message?.event, "usageUpdate");
  assert.equal(message?.usage?.usedTokens, 10_000);
});

test("drops invalid usage-update events", () => {
  assert.equal(
    agentHookMessageFromAcpUsageEvent({ type: "usage-update", usage: {} }),
    null,
  );
  assert.equal(agentHookMessageFromAcpUsageEvent({ type: "session-update" }), null);
});
