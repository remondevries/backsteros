import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  clearWorkspaceUpdatedListeners,
  subscribeWorkspaceUpdated,
  type WorkspaceUpdatedEvent,
} from "../../lib/workspace-events.js";
import { publishWorkspaceUpdatedFromSyncEvent } from "./sync-event-live-publish.js";
import { resolveReplicationIntervalMs } from "./config.js";

describe("publishWorkspaceUpdatedFromSyncEvent", () => {
  beforeEach(() => {
    clearWorkspaceUpdatedListeners();
  });

  it("publishes document upserts with contentVersion", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "document",
      entityId: "doc_1",
      operation: "upsert",
      payload: {
        content_version: 7,
        project_id: "proj_1",
      },
    });

    assert.equal(received.length, 1);
    assert.equal(received[0]?.kind, "document");
    assert.equal(received[0]?.entityId, "doc_1");
    assert.equal(received[0]?.contentVersion, 7);
    assert.equal(received[0]?.operation, "upsert");
    assert.equal(received[0]?.projectId, "proj_1");
  });

  it("publishes document deletes", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "document",
      entityId: "doc_1",
      operation: "delete",
      payload: {},
    });

    assert.equal(received[0]?.operation, "delete");
  });

  it("publishes tasks", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "task",
      entityId: "task_1",
      operation: "upsert",
      payload: { project_id: "proj_1" },
    });

    assert.equal(received[0]?.kind, "task");
    assert.equal(received[0]?.entityId, "task_1");
  });

  it("publishes task_comment against the parent task id", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "task_comment",
      entityId: "comment_1",
      operation: "upsert",
      payload: { task_id: "task_1", project_id: "proj_1" },
    });

    assert.equal(received.length, 1);
    assert.equal(received[0]?.kind, "task");
    assert.equal(received[0]?.entityId, "task_1");
    assert.equal(received[0]?.reason, "comment");
    assert.equal(received[0]?.projectId, "proj_1");
  });

  it("ignores task_comment without a task_id", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "task_comment",
      entityId: "comment_1",
      operation: "upsert",
      payload: {},
    });

    assert.equal(received.length, 0);
  });

  it("ignores entities without a live shell channel", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "contact",
      entityId: "c_1",
      operation: "upsert",
      payload: {},
    });

    assert.equal(received.length, 0);
  });
});

describe("resolveReplicationIntervalMs", () => {
  it("defaults when unset", () => {
    assert.equal(resolveReplicationIntervalMs({}), 15_000);
  });

  it("reads CORE_REPLICATION_INTERVAL_MS and clamps", () => {
    assert.equal(
      resolveReplicationIntervalMs({ CORE_REPLICATION_INTERVAL_MS: "5000" }),
      5_000,
    );
    assert.equal(
      resolveReplicationIntervalMs({ CORE_REPLICATION_INTERVAL_MS: "500" }),
      2_000,
    );
    assert.equal(
      resolveReplicationIntervalMs({ CORE_REPLICATION_INTERVAL_MS: "999999" }),
      120_000,
    );
  });
});
