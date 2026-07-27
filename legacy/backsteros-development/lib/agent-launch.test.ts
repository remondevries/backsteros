import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildReadyToStartAgentPrompt } from "./agent-launch.ts";

describe("buildReadyToStartAgentPrompt", () => {
  it("includes working directory when provided", () => {
    const prompt = buildReadyToStartAgentPrompt({
      id: "task-1",
      number: 2,
      title: "Check local time",
      description: "Report the local time.",
      projectKey: "LD",
      workingDirectory: "/Users/me/code/lemo",
    });
    assert.match(prompt, /Task ID: LD-2/);
    assert.match(prompt, /Working directory: \/Users\/me\/code\/lemo/);
    assert.match(prompt, /shell is already in this directory/);
  });

  it("omits working directory lines when unset", () => {
    const prompt = buildReadyToStartAgentPrompt({
      id: "task-1",
      number: 2,
      title: "Check local time",
      description: null,
      projectKey: "LD",
    });
    assert.doesNotMatch(prompt, /Working directory:/);
  });
});
