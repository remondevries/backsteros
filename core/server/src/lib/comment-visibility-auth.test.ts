import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthContext } from "../middleware/auth.js";
import {
  canListAllCommentVisibilities,
  isPortalCommentVisibilityKey,
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
  it("defaults staff/agent to all when visibility is omitted", () => {
    assert.deepEqual(
      resolveCommentListVisibility(auth({ kind: "api_key" }), null),
      { ok: true, visibility: "all" },
    );
    assert.deepEqual(
      resolveCommentListVisibility(auth({ kind: "local_shell" }), undefined),
      { ok: true, visibility: "all" },
    );
  });

  it("allows staff/agent keys to request all or internal explicitly", () => {
    assert.equal(canListAllCommentVisibilities(auth({ kind: "api_key" })), true);
    assert.equal(
      canListAllCommentVisibilities(auth({ kind: "local_shell" })),
      true,
    );
    assert.deepEqual(
      resolveCommentListVisibility(auth({ kind: "api_key" }), "all"),
      { ok: true, visibility: "all" },
    );
    assert.deepEqual(
      resolveCommentListVisibility(auth({ kind: "local_shell" }), "internal"),
      { ok: true, visibility: "internal" },
    );
    assert.deepEqual(
      resolveCommentListVisibility(auth({ kind: "api_key" }), "client_visible"),
      { ok: true, visibility: "client_visible" },
    );
  });

  it("locks portal-scoped keys to client_visible and refuses all/internal", () => {
    const portal = auth({
      kind: "api_key",
      scopes: ["tasks:read", "tasks:write", "portal"],
    });
    assert.equal(isPortalCommentVisibilityKey(portal), true);
    assert.equal(canListAllCommentVisibilities(portal), false);
    assert.deepEqual(resolveCommentListVisibility(portal, null), {
      ok: true,
      visibility: "client_visible",
    });
    assert.deepEqual(
      resolveCommentListVisibility(portal, "client_visible"),
      { ok: true, visibility: "client_visible" },
    );
    const refused = resolveCommentListVisibility(portal, "all");
    assert.equal(refused.ok, false);
    if (!refused.ok) {
      assert.equal(refused.status, 403);
    }
  });

  it("forces client_visible when auth cannot escalate", () => {
    assert.equal(canListAllCommentVisibilities(null), false);
    assert.deepEqual(resolveCommentListVisibility(null, "all"), {
      ok: true,
      visibility: "client_visible",
    });
    assert.deepEqual(resolveCommentListVisibility(null, "internal"), {
      ok: true,
      visibility: "client_visible",
    });
  });
});
