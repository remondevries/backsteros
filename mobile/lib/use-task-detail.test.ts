import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldFetchTaskDetailViaRest } from "./should-fetch-task-detail-via-rest.ts";

describe("shouldFetchTaskDetailViaRest", () => {
  it("does not fetch when PowerSync already has the row", () => {
    assert.equal(
      shouldFetchTaskDetailViaRest({
        taskId: "t1",
        hasSyncedTask: true,
        syncLoading: false,
        powerSyncStatus: "ready",
        powerSyncReady: true,
        restFallbackAllowed: false,
      }),
      false,
    );
  });

  it("waits while sync is still connecting", () => {
    assert.equal(
      shouldFetchTaskDetailViaRest({
        taskId: "t1",
        hasSyncedTask: false,
        syncLoading: false,
        powerSyncStatus: "connecting",
        powerSyncReady: false,
        restFallbackAllowed: false,
      }),
      false,
    );
  });

  it("fetches via REST when sync is ready but the row is missing", () => {
    assert.equal(
      shouldFetchTaskDetailViaRest({
        taskId: "t1",
        hasSyncedTask: false,
        syncLoading: false,
        powerSyncStatus: "ready",
        powerSyncReady: true,
        restFallbackAllowed: false,
      }),
      true,
    );
  });

  it("fetches via REST once the empty-DB fallback timer fires", () => {
    assert.equal(
      shouldFetchTaskDetailViaRest({
        taskId: "t1",
        hasSyncedTask: false,
        syncLoading: false,
        powerSyncStatus: "connecting",
        powerSyncReady: false,
        restFallbackAllowed: true,
      }),
      true,
    );
  });
});
