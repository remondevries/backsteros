import assert from "node:assert/strict";
import test from "node:test";

import {
  BUNQ_PAYMENT_APPROVER_STEP_MS,
  computeBunqPaymentApproverCode,
  verifyBunqPaymentApproverCode,
} from "./bunq-payment-approver-stepup.js";

const SECRET = "test-approver-secret-do-not-use-in-prod";
const HASH =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("approver code is 6 digits and stable within a step", () => {
  const at = 1_700_000_000_000;
  const a = computeBunqPaymentApproverCode(SECRET, HASH, at);
  const b = computeBunqPaymentApproverCode(SECRET, HASH, at + 1_000);
  assert.match(a, /^\d{6}$/);
  assert.equal(a, b);
});

test("approver code changes with proposal hash", () => {
  const at = 1_700_000_000_000;
  const a = computeBunqPaymentApproverCode(SECRET, HASH, at);
  const other =
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  const b = computeBunqPaymentApproverCode(SECRET, other, at);
  assert.notEqual(a, b);
});

test("verify accepts current and adjacent time steps", () => {
  const at = 1_700_000_030_000;
  const code = computeBunqPaymentApproverCode(SECRET, HASH, at);
  assert.equal(verifyBunqPaymentApproverCode(SECRET, HASH, code, at), true);
  assert.equal(
    verifyBunqPaymentApproverCode(
      SECRET,
      HASH,
      code,
      at + BUNQ_PAYMENT_APPROVER_STEP_MS,
    ),
    true,
  );
  assert.equal(
    verifyBunqPaymentApproverCode(
      SECRET,
      HASH,
      code,
      at - BUNQ_PAYMENT_APPROVER_STEP_MS,
    ),
    true,
  );
  assert.equal(
    verifyBunqPaymentApproverCode(
      SECRET,
      HASH,
      code,
      at + 3 * BUNQ_PAYMENT_APPROVER_STEP_MS,
    ),
    false,
  );
  assert.equal(verifyBunqPaymentApproverCode(SECRET, HASH, "000000", at), false);
});
