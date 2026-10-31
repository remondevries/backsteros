import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chatThreadSchema,
  getOrCreateChatThreadInputSchema,
} from "./agents-chat.js";

describe("project chat thread contracts", () => {
  it("accepts agentId or projectId exclusively on get-or-create", () => {
    assert.equal(
      getOrCreateChatThreadInputSchema.safeParse({ agentId: "ag_1" }).success,
      true,
    );
    assert.equal(
      getOrCreateChatThreadInputSchema.safeParse({ projectId: "proj_1" })
        .success,
      true,
    );
    assert.equal(
      getOrCreateChatThreadInputSchema.safeParse({}).success,
      false,
    );
    assert.equal(
      getOrCreateChatThreadInputSchema.safeParse({
        agentId: "ag_1",
        projectId: "proj_1",
      }).success,
      false,
    );
  });

  it("requires nullable projectId on chatThreadSchema", () => {
    const parsed = chatThreadSchema.safeParse({
      id: "th_1",
      workspaceId: "ws_1",
      agentId: "ag_1",
      projectId: null,
      pendingReplyAt: null,
      createdAt: "2026-10-31T12:00:00.000Z",
      updatedAt: "2026-10-31T12:00:00.000Z",
    });
    assert.equal(parsed.success, true);
    const withProject = chatThreadSchema.safeParse({
      id: "th_1",
      workspaceId: "ws_1",
      agentId: "ag_1",
      projectId: "proj_1",
      pendingReplyAt: null,
      createdAt: "2026-10-31T12:00:00.000Z",
      updatedAt: "2026-10-31T12:00:00.000Z",
    });
    assert.equal(withProject.success, true);
    assert.equal(
      chatThreadSchema.safeParse({
        id: "th_1",
        workspaceId: "ws_1",
        agentId: "ag_1",
        pendingReplyAt: null,
        createdAt: "2026-10-31T12:00:00.000Z",
        updatedAt: "2026-10-31T12:00:00.000Z",
      }).success,
      false,
    );
  });
});
