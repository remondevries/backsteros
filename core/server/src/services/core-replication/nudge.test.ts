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

  it("publishes task deletes with operation delete", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "task",
      entityId: "t_del",
      operation: "delete",
      payload: {},
    });

    assert.equal(received.length, 1);
    assert.equal(received[0]?.kind, "task");
    assert.equal(received[0]?.entityId, "t_del");
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

  it("publishes meetings with delete operation", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "meeting",
      entityId: "mtg_1",
      operation: "delete",
      payload: { project_id: "proj_1" },
    });

    assert.equal(received.length, 1);
    assert.equal(received[0]?.kind, "meeting");
    assert.equal(received[0]?.entityId, "mtg_1");
    assert.equal(received[0]?.operation, "delete");
    assert.equal(received[0]?.projectId, "proj_1");
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

  it("publishes contact and crm_group_member updates for open shells", () => {
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
    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "crm_group_member",
      entityId: "m_1",
      operation: "delete",
      payload: {},
    });

    assert.equal(received.length, 2);
    assert.equal(received[0]?.kind, "contact");
    assert.equal(received[0]?.entityId, "c_1");
    assert.equal(received[0]?.operation, "upsert");
    assert.equal(received[1]?.kind, "crm_group_member");
    assert.equal(received[1]?.operation, "delete");
  });

  it("publishes task_activity against the parent task id", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "task_activity",
      entityId: "ta_1",
      operation: "upsert",
      payload: { task_id: "t_9" },
    });

    assert.equal(received.length, 1);
    assert.equal(received[0]?.kind, "task");
    assert.equal(received[0]?.entityId, "t_9");
  });

  it("ignores unknown entity names without a live shell channel", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "not_a_sync_entity",
      entityId: "x_1",
      operation: "upsert",
      payload: {},
    });

    assert.equal(received.length, 0);
  });

  it("publishes finance and habit entities for open shells", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "bank_account",
      entityId: "ba_1",
      operation: "upsert",
      payload: {},
    });
    publishWorkspaceUpdatedFromSyncEvent("ws_1", {
      entity: "habit",
      entityId: "h_1",
      operation: "delete",
      payload: {},
    });

    assert.equal(received.length, 2);
    assert.equal(received[0]?.kind, "bank_account");
    assert.equal(received[1]?.kind, "habit");
    assert.equal(received[1]?.operation, "delete");
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
