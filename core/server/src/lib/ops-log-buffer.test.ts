import assert from "node:assert/strict";
import { test } from "node:test";

import { appendOpsLog, listOpsLogs } from "./ops-log-buffer.js";

test("listOpsLogs returns newest entries first within limit", () => {
  appendOpsLog("info", "ops-test-a");
  appendOpsLog("warn", "ops-test-b");
  const logs = listOpsLogs(2);
  assert.ok(logs.length >= 2);
  assert.equal(logs[0]?.message, "ops-test-b");
  assert.equal(logs[0]?.level, "warn");
});
