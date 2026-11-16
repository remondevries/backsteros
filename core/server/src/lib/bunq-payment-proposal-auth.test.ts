import assert from "node:assert/strict";
import test from "node:test";

import type { AuthContext } from "../middleware/auth.js";
import { computeBunqPaymentApproverCode } from "./bunq-payment-approver-stepup.js";
import {
  assertMayTogglePaymentsPause,
  assertRemonPaymentApprover,
  resolveBunqPaymentApproverApiKeyIds,
} from "./bunq-payment-proposal-auth.js";

const OWNER = "user_owner";
const HASH =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SECRET = "unit-test-totp-secret";
const APPROVER_KEY = "key_approver_device";

function auth(partial: Partial<AuthContext>): AuthContext {
  return {
    kind: "api_key",
    userId: OWNER,
    clerkUserId: null,
    apiKeyId: APPROVER_KEY,
    contactId: null,
    workspaceId: "ws_1",
    membershipRole: "owner",
    scopes: ["finance:write"],
    ...partial,
  };
}

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    BUNQ_PAYMENT_APPROVER_TOTP_SECRET: SECRET,
    BUNQ_PAYMENT_APPROVER_API_KEY_IDS: APPROVER_KEY,
    ...extra,
  };
}

function stepUp(atMs = 1_700_000_000_000) {
  return {
    proposalHash: HASH,
    approverCode: computeBunqPaymentApproverCode(SECRET, HASH, atMs),
    nowMs: atMs,
  };
}

test("resolveBunqPaymentApproverApiKeyIds parses CSV", () => {
  const ids = resolveBunqPaymentApproverApiKeyIds({
    BUNQ_PAYMENT_APPROVER_API_KEY_IDS: " a ,b, ",
  });
  assert.deepEqual([...ids].sort(), ["a", "b"]);
});

test("assertRemonPaymentApprover accepts allowlisted Access key with step-up", () => {
  const userId = assertRemonPaymentApprover(
    auth({}),
    OWNER,
    stepUp(),
    env(),
  );
  assert.equal(userId, OWNER);
});

test("assertRemonPaymentApprover refuses Portal-like Access key outside allowlist", () => {
  assert.throws(
    () =>
      assertRemonPaymentApprover(
        auth({ apiKeyId: "key_portal" }),
        OWNER,
        stepUp(),
        env(),
      ),
    /not allowed to approve/,
  );
});

test("assertRemonPaymentApprover refuses agent persona keys", () => {
  assert.throws(
    () =>
      assertRemonPaymentApprover(
        auth({ contactId: "contact_ralph", apiKeyId: "key_ralph" }),
        OWNER,
        stepUp(),
        env(),
      ),
    /Ralph cannot approve/,
  );
});

test("assertRemonPaymentApprover refuses missing step-up secret", () => {
  assert.throws(
    () =>
      assertRemonPaymentApprover(
        auth({ kind: "local_shell", apiKeyId: null }),
        OWNER,
        stepUp(),
        { BUNQ_PAYMENT_APPROVER_API_KEY_IDS: APPROVER_KEY },
      ),
    /BUNQ_PAYMENT_APPROVER_TOTP_SECRET/,
  );
});

test("assertRemonPaymentApprover refuses bad step-up code", () => {
  assert.throws(
    () =>
      assertRemonPaymentApprover(
        auth({ kind: "local_shell", apiKeyId: null }),
        OWNER,
        { proposalHash: HASH, approverCode: "000000", nowMs: 1_700_000_000_000 },
        env(),
      ),
    /Invalid or expired/,
  );
});

test("assertRemonPaymentApprover accepts local_shell with step-up", () => {
  const userId = assertRemonPaymentApprover(
    auth({ kind: "local_shell", apiKeyId: null }),
    OWNER,
    stepUp(),
    env(),
  );
  assert.equal(userId, OWNER);
});

test("M4 pause is easy, resume needs local shell or an approver key", () => {
  const env = { BUNQ_PAYMENT_APPROVER_API_KEY_IDS: APPROVER_KEY };
  const other = auth({ apiKeyId: "key_other" });
  assert.doesNotThrow(() => assertMayTogglePaymentsPause(other, OWNER, true, env));
  assert.throws(() => assertMayTogglePaymentsPause(other, OWNER, false, env), /Resuming/);
  assert.doesNotThrow(() =>
    assertMayTogglePaymentsPause(auth({}), OWNER, false, env),
  );
  assert.doesNotThrow(() =>
    assertMayTogglePaymentsPause(
      auth({ kind: "local_shell", apiKeyId: null }),
      OWNER,
      false,
      env,
    ),
  );
  // Agents and non-owners can never toggle in either direction.
  const agent = auth({ contactId: "contact_1" });
  assert.throws(() => assertMayTogglePaymentsPause(agent, OWNER, true, env), /Agents/);
  assert.throws(
    () => assertMayTogglePaymentsPause(auth({ userId: "someone_else" }), OWNER, true, env),
    /workspace owner/,
  );
});
