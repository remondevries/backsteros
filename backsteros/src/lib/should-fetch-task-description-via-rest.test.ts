import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldFetchTaskDescriptionViaRest } from "./should-fetch-task-description-via-rest.ts";

test("shouldFetchTaskDescriptionViaRest skips when SQLite has the row", () => {
  assert.equal(
    shouldFetchTaskDescriptionViaRest({
      taskId: "t1",
      hasLocalRow: true,
      syncLoading: false,
      powerSyncReady: true,
      powerSyncStatus: "ready",
    }),
    false,
  );
});

test("shouldFetchTaskDescriptionViaRest waits while local watch loads", () => {
  assert.equal(
    shouldFetchTaskDescriptionViaRest({
      taskId: "t1",
      hasLocalRow: false,
      syncLoading: true,
      powerSyncReady: true,
      powerSyncStatus: "ready",
    }),
    false,
  );
});

test("shouldFetchTaskDescriptionViaRest allows REST after empty local settle", () => {
  assert.equal(
    shouldFetchTaskDescriptionViaRest({
      taskId: "t1",
      hasLocalRow: false,
      syncLoading: false,
      powerSyncReady: true,
      powerSyncStatus: "ready",
    }),
    true,
  );
});

test("shouldFetchTaskDescriptionViaRest waits for PowerSync readiness", () => {
  assert.equal(
    shouldFetchTaskDescriptionViaRest({
      taskId: "t1",
      hasLocalRow: false,
      syncLoading: false,
      powerSyncReady: false,
      powerSyncStatus: "connecting",
    }),
    false,
  );
});
