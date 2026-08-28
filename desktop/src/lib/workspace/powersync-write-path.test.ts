import assert from "node:assert/strict";
import { test } from "node:test";

import {
  shouldAttemptLetterPdfFetch,
  shouldSkipRestEntityWrite,
  taskPatchRequiresRestWrite,
} from "./powersync-write-path.ts";

test("shouldSkipRestEntityWrite when PowerSync ready and connected", () => {
  assert.equal(
    shouldSkipRestEntityWrite({ ready: true, connected: true }),
    true,
  );
  assert.equal(
    shouldSkipRestEntityWrite({ ready: true, connected: false }),
    false,
  );
  assert.equal(
    shouldSkipRestEntityWrite({ ready: false, connected: true }),
    false,
  );
});

test("shouldAttemptLetterPdfFetch only when local-core is reachable", () => {
  assert.equal(shouldAttemptLetterPdfFetch(true, true), true);
  assert.equal(shouldAttemptLetterPdfFetch(false, true), false);
  assert.equal(shouldAttemptLetterPdfFetch(null, true), false);
  assert.equal(shouldAttemptLetterPdfFetch(true, false), false);
});

test("taskPatchRequiresRestWrite for agent inbox sign-off only", () => {
  assert.equal(taskPatchRequiresRestWrite({ agentInboxApproved: true }), true);
  assert.equal(taskPatchRequiresRestWrite({ agentInboxApproved: false }), false);
  assert.equal(taskPatchRequiresRestWrite({ title: "x" }), false);
});

test("connected PowerSync still RESTs agent inbox approval", async () => {
  let restCalled = false;
  const client = {
    requestJson: async () => {
      restCalled = true;
      return {};
    },
  };

  const powerSync = { ready: true, connected: true };
  const values = { agentInboxApproved: true };
  if (
    !shouldSkipRestEntityWrite(powerSync) ||
    taskPatchRequiresRestWrite(values)
  ) {
    await client.requestJson("/api/v1/tasks/task-id", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
  }

  assert.equal(restCalled, true);
});

test("connected PowerSync patch does not invoke REST for ordinary fields", async () => {
  let restCalled = false;
  const client = {
    requestJson: async () => {
      restCalled = true;
      return {};
    },
  };

  const powerSync = { ready: true, connected: true };
  if (!shouldSkipRestEntityWrite(powerSync)) {
    await client.requestJson("/api/v1/tasks/task-id", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Proof" }),
    });
  }

  assert.equal(restCalled, false);
});
