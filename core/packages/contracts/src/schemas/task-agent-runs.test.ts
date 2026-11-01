import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createTaskAgentRunCheckSchema,
  createTaskAgentRunSchema,
  taskAgentRunSchema,
  updateTaskAgentRunSchema,
} from "./projects-tasks.js";

describe("task agent run schemas", () => {
  it("parses create run input", () => {
    const parsed = createTaskAgentRunSchema.parse({
      conductorAgentId: "agent_1",
    });
    assert.equal(parsed.conductorAgentId, "agent_1");
    assert.equal(parsed.replaceActive, undefined);
  });

  it("rejects empty update", () => {
    assert.throws(() => updateTaskAgentRunSchema.parse({}));
  });

  it("parses phase advance", () => {
    const parsed = updateTaskAgentRunSchema.parse({
      phase: "build",
      buildPrompt: "Implement the accordion wiring",
    });
    assert.equal(parsed.phase, "build");
    assert.match(parsed.buildPrompt ?? "", /accordion/);
  });

  it("parses a run with checks", () => {
    const parsed = taskAgentRunSchema.parse({
      id: "run_1",
      taskId: "task_1",
      projectId: null,
      conductorAgentId: "agent_1",
      conductorContactId: null,
      phase: "verify",
      cycle: 2,
      status: "active",
      briefThreadId: "th_1",
      builderSessionId: "sess_1",
      buildPrompt: null,
      recordIntent: null,
      recordNotes: null,
      lastError: null,
      createdAt: "2026-11-01T12:00:00.000Z",
      updatedAt: "2026-11-01T12:01:00.000Z",
      checks: [
        {
          id: "chk_1",
          runId: "run_1",
          key: "typecheck",
          label: "Typecheck",
          status: "running",
          detail: null,
          logText: null,
          sortOrder: 0,
          startedAt: "2026-11-01T12:01:00.000Z",
          finishedAt: null,
          createdAt: "2026-11-01T12:01:00.000Z",
          updatedAt: "2026-11-01T12:01:00.000Z",
        },
      ],
    });
    assert.equal(parsed.checks?.[0]?.key, "typecheck");
  });

  it("parses create check", () => {
    const parsed = createTaskAgentRunCheckSchema.parse({
      key: "lint",
      label: "Lint",
      status: "pending",
    });
    assert.equal(parsed.key, "lint");
  });
});
