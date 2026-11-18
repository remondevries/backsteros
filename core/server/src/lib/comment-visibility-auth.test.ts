import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthContext } from "../middleware/auth.js";
import {
  canListAllCommentVisibilities,
  resolveCommentListVisibility,
} from "./comment-visibility-auth.js";

function auth(
  partial: Partial<AuthContext> & Pick<AuthContext, "kind">,
): AuthContext {
  return {
    userId: partial.userId ?? "user-1",
    clerkUserId: partial.clerkUserId ?? null,
    apiKeyId: partial.apiKeyId ?? null,
    contactId: partial.contactId ?? null,
    workspaceId: partial.workspaceId ?? "ws",
    membershipRole: partial.membershipRole ?? null,
    scopes: partial.scopes ?? ["tasks:read"],
    kind: partial.kind,
  };
}

describe("comment visibility auth (OS-187)", () => {
  it("defaults to client_visible when omitted", () => {
    assert.equal(
      resolveCommentListVisibility(auth({ kind: "api_key" }), null),
      "client_visible",
    );
    assert.equal(
      resolveCommentListVisibility(auth({ kind: "local_shell" }), undefined),
      "client_visible",
    );
  });

  it("allows staff/agent keys to request all or internal explicitly", () => {
    assert.equal(canListAllCommentVisibilities(auth({ kind: "api_key" })), true);
    assert.equal(
      canListAllCommentVisibilities(auth({ kind: "local_shell" })),
      true,
    );
    assert.equal(
      resolveCommentListVisibility(auth({ kind: "api_key" }), "all"),
      "all",
    );
    assert.equal(
      resolveCommentListVisibility(auth({ kind: "local_shell" }), "internal"),
      "internal",
    );
  });

  it("forces client_visible when auth cannot escalate", () => {
    assert.equal(canListAllCommentVisibilities(null), false);
    assert.equal(resolveCommentListVisibility(null, "all"), "client_visible");
    assert.equal(
      resolveCommentListVisibility(null, "internal"),
      "client_visible",
    );
  });
});
