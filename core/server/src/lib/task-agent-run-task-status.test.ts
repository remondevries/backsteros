import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  shouldApplyFactoryTaskStatus,
  taskSyncForAgentRunPhase,
} from "./task-agent-run-task-status.js";

describe("taskSyncForAgentRunPhase", () => {
  it("maps brief and build to in_progress with working claim", () => {
    for (const phase of ["brief", "build"] as const) {
      assert.deepEqual(taskSyncForAgentRunPhase(phase), {
        status: "in_progress",
        claimWorking: true,
        clearWorking: false,
      });
    }
  });

  it("maps verify/record/ship/done to in_review and clears working", () => {
    for (const phase of ["verify", "record", "ship", "done"] as const) {
      assert.deepEqual(taskSyncForAgentRunPhase(phase), {
        status: "in_review",
        claimWorking: false,
        clearWorking: true,
      });
    }
  });

  it("clears working on failed without forcing status", () => {
    assert.deepEqual(taskSyncForAgentRunPhase("failed"), {
      status: null,
      claimWorking: false,
      clearWorking: true,
    });
  });
});

describe("shouldApplyFactoryTaskStatus", () => {
  it("skips terminal task statuses", () => {
    assert.equal(shouldApplyFactoryTaskStatus("completed", "in_progress"), false);
    assert.equal(shouldApplyFactoryTaskStatus("canceled", "in_review"), false);
  });

  it("applies when status would change", () => {
    assert.equal(shouldApplyFactoryTaskStatus("ready_to_start", "in_progress"), true);
    assert.equal(shouldApplyFactoryTaskStatus("in_progress", "in_progress"), false);
    assert.equal(shouldApplyFactoryTaskStatus("in_progress", "in_review"), true);
  });
});
