import assert from "node:assert/strict";
import { test } from "node:test";

import {
  localOnlyRestFailClosed,
  mustDualWriteRestAfterCrudFlush,
  shouldAttemptLetterPdfFetch,
  shouldSkipRestAfterCrudFlush,
  shouldSkipRestEntityWrite,
  taskPatchRequiresRestWrite,
} from "./powersync-write-path.ts";

test("localOnlyRestFailClosed for cloud API, not loopback", () => {
  assert.equal(localOnlyRestFailClosed("http://100.75.45.22:8788"), true);
  assert.equal(localOnlyRestFailClosed("https://agent.backsteros.com"), true);
  assert.equal(localOnlyRestFailClosed("http://127.0.0.1:8788"), false);
  assert.equal(localOnlyRestFailClosed("http://localhost:8788"), false);
});

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

test("shouldSkipRestAfterCrudFlush only when upload drained work", () => {
  assert.equal(shouldSkipRestAfterCrudFlush(true), true);
  assert.equal(shouldSkipRestAfterCrudFlush(undefined), true);
  assert.equal(shouldSkipRestAfterCrudFlush(false), false);
});

test("mustDualWriteRestAfterCrudFlush for due-date clears and health checks", () => {
  assert.equal(mustDualWriteRestAfterCrudFlush("tasks", { dueDate: null }), true);
  assert.equal(
    mustDualWriteRestAfterCrudFlush("tasks", { dueDate: "2026-09-20T00:00:00.000Z" }),
    false,
  );
  assert.equal(mustDualWriteRestAfterCrudFlush("tasks", { title: "x" }), false);
  assert.equal(
    mustDualWriteRestAfterCrudFlush("projects", { healthCheckMode: "domain" }),
    true,
  );
  assert.equal(mustDualWriteRestAfterCrudFlush("projects", { dueDate: null }), true);
  assert.equal(mustDualWriteRestAfterCrudFlush("projects", { startDate: null }), true);
  assert.equal(mustDualWriteRestAfterCrudFlush("projects", { name: "x" }), false);
  assert.equal(mustDualWriteRestAfterCrudFlush("letters", { dueDate: null }), true);
});

test("connected PowerSync still RESTs due-date clears after flush", () => {
  const uploaded = true;
  const values = { dueDate: null };
  const skip =
    shouldSkipRestAfterCrudFlush(uploaded) &&
    !mustDualWriteRestAfterCrudFlush("tasks", values);
  assert.equal(skip, false);
});

test("cloud fail-closed path still dual-writes due-date clears", () => {
  const powerSync = { ready: true, connected: true };
  const apiUrl = "https://api.local.backsteros.com";
  assert.equal(shouldSkipRestEntityWrite(powerSync), true);
  assert.equal(localOnlyRestFailClosed(apiUrl), true);
  // Cloud path flushes PowerSync then must still REST when this is true.
  assert.equal(
    mustDualWriteRestAfterCrudFlush("tasks", { dueDate: null }),
    true,
  );
  assert.equal(
    mustDualWriteRestAfterCrudFlush("tasks", { priority: 2 }),
    false,
  );
});

test("shouldAttemptLetterPdfFetch on cloud even when local-core is down", () => {
  assert.equal(
    shouldAttemptLetterPdfFetch(false, true, "http://100.75.45.22:8788"),
    true,
  );
  assert.equal(
    shouldAttemptLetterPdfFetch(null, true, "http://127.0.0.1:8788"),
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
