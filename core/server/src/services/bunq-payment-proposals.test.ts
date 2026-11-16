import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthContext } from "../middleware/auth.js";
import { computeBunqPaymentApproverCode } from "../lib/bunq-payment-approver-stepup.js";
import {
  assertAgentAllowedToProposeBunqPayments,
  assertRemonPaymentApprover,
} from "../lib/bunq-payment-proposal-auth.js";

const HASH =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SECRET = "unit-test-totp-secret";
const APPROVER_KEY = "key-1";
const AT = 1_700_000_000_000;

function auth(partial: Partial<AuthContext>): AuthContext {
  return {
    kind: "api_key",
    userId: "owner-1",
    clerkUserId: null,
    apiKeyId: APPROVER_KEY,
    contactId: null,
    workspaceId: "ws-1",
    membershipRole: null,
    scopes: ["finance:write"],
    ...partial,
  };
}

function env(): NodeJS.ProcessEnv {
  return {
    BUNQ_PAYMENT_APPROVER_TOTP_SECRET: SECRET,
    BUNQ_PAYMENT_APPROVER_API_KEY_IDS: APPROVER_KEY,
  };
}

function stepUp() {
  return {
    proposalHash: HASH,
    approverCode: computeBunqPaymentApproverCode(SECRET, HASH, AT),
    nowMs: AT,
  };
}

describe("assertRemonPaymentApprover (no DATABASE_URL)", () => {
  it("allows local-shell owner Remon with step-up", () => {
    assert.equal(
      assertRemonPaymentApprover(
        auth({ kind: "local_shell", apiKeyId: null, userId: "owner-1" }),
        "owner-1",
        stepUp(),
        env(),
      ),
      "owner-1",
    );
  });

  it("allows allowlisted Access key owner Remon with step-up", () => {
    assert.equal(
      assertRemonPaymentApprover(
        auth({ kind: "api_key", contactId: null, userId: "owner-1" }),
        "owner-1",
        stepUp(),
        env(),
      ),
      "owner-1",
    );
  });

  it("refuses non-allowlisted Access keys even with finance:write", () => {
    assert.throws(
      () =>
        assertRemonPaymentApprover(
          auth({ apiKeyId: "key-portal" }),
          "owner-1",
          stepUp(),
          env(),
        ),
      (error: unknown) =>
        error instanceof Error &&
        (error as { status?: number }).status === 403 &&
        /not allowed to approve/i.test(error.message),
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
          stepUp(),
          env(),
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
          stepUp(),
          env(),
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
