import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthContext } from "../middleware/auth.js";
import { canRevealTransipDomainAuthCode } from "./transip-auth-code-access.js";

function auth(partial: Partial<AuthContext>): AuthContext {
  return {
    kind: "api_key",
    userId: "user-1",
    clerkUserId: null,
    apiKeyId: "key-1",
    apiKeyName: "Access",
    contactId: null,
    workspaceId: "ws-1",
    membershipRole: null,
    scopes: [],
    ...partial,
  };
}

describe("canRevealTransipDomainAuthCode", () => {
  it("allows local-shell owner", () => {
    const decision = canRevealTransipDomainAuthCode(
      auth({
        kind: "local_shell",
        apiKeyId: null,
        membershipRole: "owner",
        scopes: [],
      }),
    );
    assert.deepEqual(decision, { allowed: true });
  });

  it("allows settings:write Access keys", () => {
    const decision = canRevealTransipDomainAuthCode(
      auth({ scopes: ["settings:write", "projects:read"] }),
    );
    assert.deepEqual(decision, { allowed: true });
  });

  it("refuses projects:read alone", () => {
    const decision = canRevealTransipDomainAuthCode(
      auth({ scopes: ["projects:read"] }),
    );
    assert.equal(decision.allowed, false);
  });

  it("refuses agent persona keys even with settings:write", () => {
    const decision = canRevealTransipDomainAuthCode(
      auth({
        contactId: "contact-agent",
        scopes: ["settings:write", "projects:write"],
      }),
    );
    assert.equal(decision.allowed, false);
  });

  it("refuses missing auth", () => {
    assert.equal(canRevealTransipDomainAuthCode(null).allowed, false);
    assert.equal(canRevealTransipDomainAuthCode(undefined).allowed, false);
  });
});
