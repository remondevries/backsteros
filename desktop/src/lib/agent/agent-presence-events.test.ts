import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyAgentPresenceLiveEvent } from "./agent-presence-events";

describe("applyAgentPresenceLiveEvent", () => {
  it("adds a newly live task id", () => {
    const next = applyAgentPresenceLiveEvent(new Set(["a"]), {
      taskId: "b",
      live: true,
    });
    assert.deepEqual([...next].sort(), ["a", "b"]);
  });

  it("is a no-op when already live", () => {
    const current = new Set(["a"]);
    const next = applyAgentPresenceLiveEvent(current, {
      taskId: "a",
      live: true,
    });
    assert.equal(next, current);
  });

  it("removes a cleared task id", () => {
    const next = applyAgentPresenceLiveEvent(new Set(["a", "b"]), {
      taskId: "a",
      live: false,
    });
    assert.deepEqual([...next], ["b"]);
  });

  it("returns empty set when last id clears", () => {
    const next = applyAgentPresenceLiveEvent(new Set(["a"]), {
      taskId: "a",
      live: false,
    });
    assert.equal(next.size, 0);
  });
});
