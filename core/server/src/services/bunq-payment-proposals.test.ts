import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthContext } from "../middleware/auth.js";
import { assertRemonPaymentApprover } from "../lib/bunq-payment-proposal-auth.js";
import { assertAgentAllowedToProposeBunqPayments } from "../lib/bunq-payment-proposal-auth.js";

function auth(partial: Partial<AuthContext>): AuthContext {
  return {
    kind: "api_key",
    userId: "owner-1",
    clerkUserId: null,
    apiKeyId: "key-1",
    contactId: null,
    workspaceId: "ws-1",
    membershipRole: null,
    scopes: ["finance:write"],
    ...partial,
  };
}

describe("assertRemonPaymentApprover (no DATABASE_URL)", () => {
  it("allows local-shell owner Remon", () => {
    assert.equal(
      assertRemonPaymentApprover(
        auth({ kind: "local_shell", apiKeyId: null, userId: "owner-1" }),
        "owner-1",
      ),
      "owner-1",
    );
  });

  it("allows Access key owner Remon (no contactId)", () => {
    assert.equal(
      assertRemonPaymentApprover(
        auth({ kind: "api_key", contactId: null, userId: "owner-1" }),
        "owner-1",
      ),
      "owner-1",
    );
  });

  it("refuses Ralph agent persona keys", () => {
    assert.throws(
      () =>
        assertRemonPaymentApprover(
          auth({
            kind: "api_key",
            contactId: "contact-ralph",
            userId: null,
          }),
          "owner-1",
        ),
      (error: unknown) =>
        error instanceof Error &&
        (error as { status?: number }).status === 403 &&
        /Ralph cannot approve/i.test(error.message),
    );
  });

  it("refuses a different user even with Access key shape", () => {
    assert.throws(
      () =>
        assertRemonPaymentApprover(
          auth({ kind: "api_key", contactId: null, userId: "other" }),
          "owner-1",
        ),
      (error: unknown) =>
        error instanceof Error &&
        (error as { status?: number }).status === 403,
    );
  });
});

describe("assertAgentAllowedToProposeBunqPayments", () => {
  it("requires stable agent id env (not display name)", () => {
    assert.throws(
      () => assertAgentAllowedToProposeBunqPayments("agent-1", {}),
      (error: unknown) =>
        error instanceof Error &&
        /BUNQ_PAYMENT_PROPOSAL_AGENT_ID/i.test(error.message),
    );
    assert.throws(
      () =>
        assertAgentAllowedToProposeBunqPayments("agent-1", {
          BUNQ_PAYMENT_PROPOSAL_AGENT_ID: "other",
        }),
      (error: unknown) =>
        error instanceof Error &&
        (error as { status?: number }).status === 403,
    );
    assert.doesNotThrow(() =>
      assertAgentAllowedToProposeBunqPayments("agent-1", {
        BUNQ_PAYMENT_PROPOSAL_AGENT_ID: "agent-1",
      }),
    );
  });
});
