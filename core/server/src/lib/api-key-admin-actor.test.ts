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

  it("allows owner Access keys (no contact)", () => {
    assert.equal(
      rejectNonOwnerShellForCloudForward({
        kind: "api_key",
        userId: "owner-1",
        contactId: null,
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

  it("rejects non-shell actors without an owner Access identity", () => {
    const noUser = rejectNonOwnerShellForCloudForward({
      kind: "api_key",
      userId: null,
      contactId: null,
    });
    assert.ok(noUser);
    assert.match(noUser.body.error, /owner shell|Access key/);

    const clerkUser = rejectNonOwnerShellForCloudForward({
      kind: "user",
      userId: "clerk-user",
    });
    assert.ok(clerkUser);
    assert.equal(clerkUser.status, 403);
  });
});
