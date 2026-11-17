import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rejectNonOwnerShellForCloudForward } from "./api-key-admin-actor.js";

describe("rejectNonOwnerShellForCloudForward (OS-181)", () => {
  it("allows the owner local shell", () => {
    assert.equal(
      rejectNonOwnerShellForCloudForward({
        kind: "local_shell",
        userId: "owner-1",
      }),
      null,
    );
  });

  it("rejects agent (contact) API keys", () => {
    const denied = rejectNonOwnerShellForCloudForward({
      kind: "api_key",
      userId: null,
      contactId: "agent-contact",
    });
    assert.ok(denied);
    assert.equal(denied.status, 403);
    assert.match(denied.body.error, /Agent keys cannot/);
  });

  it("rejects app API keys and other non-shell actors (non-owner)", () => {
    const appKey = rejectNonOwnerShellForCloudForward({
      kind: "api_key",
      userId: "someone",
      contactId: null,
    });
    assert.ok(appKey);
    assert.match(appKey.body.error, /owner shell/);

    const clerkUser = rejectNonOwnerShellForCloudForward({
      kind: "user",
      userId: "clerk-user",
    });
    assert.ok(clerkUser);
    assert.equal(clerkUser.status, 403);
  });
});
