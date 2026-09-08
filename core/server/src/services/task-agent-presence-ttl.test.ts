import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isTaskAgentPresenceLive,
  TASK_AGENT_PRESENCE_TTL_MS,
} from "./task-agent-presence-ttl.js";

describe("isTaskAgentPresenceLive", () => {
  it("is live within the TTL window", () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    const heartbeat = new Date(now.getTime() - TASK_AGENT_PRESENCE_TTL_MS + 1_000);
    assert.equal(isTaskAgentPresenceLive(heartbeat, now), true);
  });

  it("expires after the TTL window", () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    const heartbeat = new Date(now.getTime() - TASK_AGENT_PRESENCE_TTL_MS - 1);
    assert.equal(isTaskAgentPresenceLive(heartbeat, now), false);
  });
});
