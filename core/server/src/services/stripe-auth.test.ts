import assert from "node:assert/strict";
import test from "node:test";

import { getConfiguredStripeSecretKey } from "./stripe-auth.js";

test("getConfiguredStripeSecretKey returns env when set", () => {
  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "  sk_test_env  ";
  try {
    assert.equal(getConfiguredStripeSecretKey(), "sk_test_env");
  } finally {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});
