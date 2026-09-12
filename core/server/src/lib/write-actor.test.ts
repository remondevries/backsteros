import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthContext } from "../middleware/auth.js";
import { writeActorForComment, writeActorFromAuth } from "./write-actor.js";

function apiKeyAuth(contactId: string | null = "key-contact"): AuthContext {
  return {
    kind: "api_key",
    workspaceId: "ws",
    userId: "user-1",
    clerkUserId: null,
    apiKeyId: "key-1",
    contactId,
    membershipRole: null,
    scopes: ["tasks:write"],
  };
}

describe("writeActorForComment", () => {
  it("lets API-key callers attribute comments to a portal contact", () => {
    const actor = writeActorForComment(apiKeyAuth("key-contact"), {
      authorContactId: "portal-contact",
    });
    assert.deepEqual(actor, {
      userId: null,
      contactId: "portal-contact",
      kind: "contact",
    });
  });

  it("falls back to the API key contact when no authorContactId is sent", () => {
    const actor = writeActorForComment(apiKeyAuth("key-contact"), {});
    assert.deepEqual(actor, writeActorFromAuth(apiKeyAuth("key-contact")));
  });

  it("lets authorContactId win over activityActor agent", () => {
    const actor = writeActorForComment(apiKeyAuth("key-contact"), {
      activityActor: "agent",
      authorContactId: "portal-contact",
    });
    assert.deepEqual(actor, {
      userId: null,
      contactId: "portal-contact",
      kind: "contact",
    });
  });

  it("uses the API key contact when activityActor is agent and no override", () => {
    const actor = writeActorForComment(apiKeyAuth("key-contact"), {
      activityActor: "agent",
    });
    assert.deepEqual(actor, {
      userId: null,
      contactId: "key-contact",
      kind: "contact",
    });
  });

  it("keeps agent authorship when activityActor is agent and no contact is available", () => {
    const actor = writeActorForComment(apiKeyAuth(null), {
      activityActor: "agent",
    });
    assert.deepEqual(actor, { userId: null, kind: "agent" });
  });
});
