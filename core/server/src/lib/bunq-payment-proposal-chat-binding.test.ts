import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertAgentMayPostPaymentCard,
  assertPaymentCardBoundToProposal,
  requirePaymentApproverCode,
} from "./bunq-payment-proposal-chat-binding.js";

const HASH = "a".repeat(64);

function proposal(over: Record<string, unknown> = {}) {
  return {
    status: "pending" as const,
    proposedByAgentId: "agent-1",
    chatThreadId: null as string | null,
    chatMessageId: null as string | null,
    proposalHash: HASH,
    ...over,
  };
}

function status(fn: () => void): number | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { status?: number }).status;
  }
  return undefined;
}

describe("assertAgentMayPostPaymentCard", () => {
  const ctx = { agentId: "agent-1", threadId: "t-1" };

  it("allows the proposing agent on a pending unlinked proposal", () => {
    assert.equal(status(() => assertAgentMayPostPaymentCard(proposal(), ctx)), undefined);
    assert.equal(
      status(() =>
        assertAgentMayPostPaymentCard(proposal({ chatThreadId: "t-1" }), ctx),
      ),
      undefined,
    );
  });

  it("refuses a different agent", () => {
    assert.equal(
      status(() =>
        assertAgentMayPostPaymentCard(proposal(), { ...ctx, agentId: "agent-2" }),
      ),
      403,
    );
  });

  it("refuses non-pending proposals", () => {
    for (const s of ["approved", "executed", "rejected", "expired", "needs_reconciliation"]) {
      assert.equal(
        status(() => assertAgentMayPostPaymentCard(proposal({ status: s }), ctx)),
        409,
        s,
      );
    }
  });

  it("refuses a different thread", () => {
    assert.equal(
      status(() =>
        assertAgentMayPostPaymentCard(proposal({ chatThreadId: "t-other" }), ctx),
      ),
      403,
    );
  });

  it("refuses a second card for the same proposal", () => {
    assert.equal(
      status(() =>
        assertAgentMayPostPaymentCard(proposal({ chatMessageId: "m-1" }), ctx),
      ),
      409,
    );
  });

  it("refuses a claimed hash that differs from the stored hash", () => {
    assert.equal(
      status(() =>
        assertAgentMayPostPaymentCard(proposal(), {
          ...ctx,
          claimedProposalHash: "b".repeat(64),
        }),
      ),
      400,
    );
    assert.equal(
      status(() =>
        assertAgentMayPostPaymentCard(proposal(), {
          ...ctx,
          claimedProposalHash: HASH.toUpperCase(),
        }),
      ),
      undefined,
    );
  });
});

describe("assertPaymentCardBoundToProposal", () => {
  it("requires the exact linked message and thread", () => {
    const linked = { chatMessageId: "m-1", chatThreadId: "t-1" };
    assert.equal(
      status(() =>
        assertPaymentCardBoundToProposal(linked, { threadId: "t-1", messageId: "m-1" }),
      ),
      undefined,
    );
    assert.equal(
      status(() =>
        assertPaymentCardBoundToProposal(linked, { threadId: "t-1", messageId: "m-2" }),
      ),
      403,
    );
    assert.equal(
      status(() =>
        assertPaymentCardBoundToProposal(linked, { threadId: "t-2", messageId: "m-1" }),
      ),
      403,
    );
    assert.equal(
      status(() =>
        assertPaymentCardBoundToProposal(
          { chatMessageId: null, chatThreadId: null },
          { threadId: "t-1", messageId: "m-1" },
        ),
      ),
      403,
    );
  });
});

describe("requirePaymentApproverCode", () => {
  it("requires a 6-digit code", () => {
    assert.equal(requirePaymentApproverCode(" 123456 "), "123456");
    assert.equal(status(() => requirePaymentApproverCode(undefined)), 400);
    assert.equal(status(() => requirePaymentApproverCode("12345")), 400);
    assert.equal(status(() => requirePaymentApproverCode("abcdef")), 400);
  });
});
