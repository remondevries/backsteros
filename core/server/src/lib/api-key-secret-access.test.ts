import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateApiKeySecretAccess } from "./api-key-secret-access.js";

const agentKey = { contactId: "contact-1", isPaymentProposalAgentKey: false };
const paymentKey = { contactId: "contact-1", isPaymentProposalAgentKey: true };
const accessKey = { contactId: null, isPaymentProposalAgentKey: false };

describe("evaluateApiKeySecretAccess", () => {
  it("lets local_shell reveal/rotate agent and payment-agent keys", () => {
    assert.deepEqual(
      evaluateApiKeySecretAccess({ kind: "local_shell" }, agentKey),
      { allowed: true },
    );
    assert.deepEqual(
      evaluateApiKeySecretAccess({ kind: "local_shell" }, paymentKey),
      { allowed: true },
    );
  });

  it("refuses API keys revealing/rotating agent keys", () => {
    const decision = evaluateApiKeySecretAccess({ kind: "api_key" }, agentKey);
    assert.equal(decision.allowed, false);
  });

  it("refuses API keys on the payment-proposal agent key even without a contact", () => {
    const decision = evaluateApiKeySecretAccess(
      { kind: "api_key" },
      { contactId: null, isPaymentProposalAgentKey: true },
    );
    assert.equal(decision.allowed, false);
    assert.match((decision as { reason: string }).reason, /payment-proposal/);
  });

  it("refuses clerk sessions on agent keys", () => {
    assert.equal(
      evaluateApiKeySecretAccess({ kind: "clerk" } as never, agentKey).allowed,
      false,
    );
  });

  it("keeps Access-key reveal/rotate for non-agent keys", () => {
    assert.deepEqual(
      evaluateApiKeySecretAccess({ kind: "api_key" }, accessKey),
      { allowed: true },
    );
  });
});
