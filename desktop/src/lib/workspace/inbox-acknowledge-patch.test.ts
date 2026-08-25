import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeTaskPatchForLocalState } from "./inbox-acknowledge-patch.ts";

test("normalizeTaskPatchForLocalState maps agentInboxApproved to agentInboxApprovedAt", () => {
  const result = normalizeTaskPatchForLocalState({
    agentInboxApproved: true,
  });
  assert.equal(result.agentInboxApproved, undefined);
  assert.equal(typeof result.agentInboxApprovedAt, "string");
  assert.ok(result.agentInboxApprovedAt);
});

test("normalizeTaskPatchForLocalState leaves unrelated patches unchanged", () => {
  const result = normalizeTaskPatchForLocalState({
    status: "in_progress",
    priority: "high",
  });
  assert.deepEqual(result, {
    status: "in_progress",
    priority: "high",
  });
});

test("normalizeTaskPatchForLocalState maps acknowledgeInboxUpdate to inboxUpdatedAt null", () => {
  const result = normalizeTaskPatchForLocalState({
    acknowledgeInboxUpdate: true,
    status: "in_progress",
  });
  assert.equal(result.acknowledgeInboxUpdate, undefined);
  assert.equal(result.inboxUpdatedAt, null);
  assert.equal(result.status, "in_progress");
});
