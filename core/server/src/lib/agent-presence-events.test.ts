import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  clearAgentPresenceListeners,
  publishAgentPresence,
  subscribeAgentPresence,
  type AgentPresenceEvent,
} from "./agent-presence-events.js";

describe("agent-presence-events", () => {
  beforeEach(() => {
    clearAgentPresenceListeners();
  });

  it("publishes live and clear events to workspace subscribers", () => {
    const received: AgentPresenceEvent[] = [];
    subscribeAgentPresence("ws_1", (event) => {
      received.push(event);
    });

    publishAgentPresence({
      workspaceId: "ws_1",
      taskId: "task_1",
      live: true,
    });
    publishAgentPresence({
      workspaceId: "ws_1",
      taskId: "task_1",
      live: false,
    });

    assert.equal(received.length, 2);
    assert.deepEqual(received[0], {
      workspaceId: "ws_1",
      taskId: "task_1",
      live: true,
    });
    assert.deepEqual(received[1], {
      workspaceId: "ws_1",
      taskId: "task_1",
      live: false,
    });
  });

  it("does not notify other workspaces", () => {
    const received: AgentPresenceEvent[] = [];
    subscribeAgentPresence("ws_other", (event) => {
      received.push(event);
    });

    publishAgentPresence({
      workspaceId: "ws_1",
      taskId: "task_1",
      live: true,
    });
    assert.equal(received.length, 0);
  });
});
