import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  clearWorkspaceUpdatedListeners,
  publishDocumentWorkspaceUpdated,
  subscribeWorkspaceUpdated,
  type WorkspaceUpdatedEvent,
} from "./workspace-events.js";

describe("workspace-events", () => {
  beforeEach(() => {
    clearWorkspaceUpdatedListeners();
  });

  it("publishes document updates to workspace subscribers", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishDocumentWorkspaceUpdated("ws_1", "doc_1", {
      projectId: "proj_1",
      contentVersion: 4,
    });

    assert.equal(received.length, 1);
    assert.deepEqual(received[0], {
      workspaceId: "ws_1",
      kind: "document",
      entityId: "doc_1",
      projectId: "proj_1",
      reason: "patch",
      contentVersion: 4,
      operation: "upsert",
    });
  });

  it("publishes document deletes", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_1", (event) => {
      received.push(event);
    });

    publishDocumentWorkspaceUpdated("ws_1", "doc_1", {
      operation: "delete",
    });

    assert.equal(received[0]?.operation, "delete");
  });

  it("does not notify other workspaces", () => {
    const received: WorkspaceUpdatedEvent[] = [];
    subscribeWorkspaceUpdated("ws_other", (event) => {
      received.push(event);
    });

    publishDocumentWorkspaceUpdated("ws_1", "doc_1", { contentVersion: 2 });
    assert.equal(received.length, 0);
  });
});
