import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deadLetterBackoffMs,
  DEAD_LETTER_MAX_ATTEMPTS,
  errorCodeFromUnknown,
} from "./dead-letter-policy.js";
import { isReplicationReconcileEnabled } from "./reconcile-gate.js";

describe("replication dead letters", () => {
  it("uses exponential backoff capped at 1h", () => {
    assert.equal(deadLetterBackoffMs(1), 60_000);
    assert.equal(deadLetterBackoffMs(2), 120_000);
    assert.equal(deadLetterBackoffMs(7), 3_600_000);
    assert.ok(DEAD_LETTER_MAX_ATTEMPTS >= 8);
  });

  it("reads postgres error codes when present", () => {
    assert.equal(
      errorCodeFromUnknown({ code: "23505", constraint: "x" }),
      "23505",
    );
    assert.equal(errorCodeFromUnknown(new Error("boom")), "Error");
  });
});

describe("replication reconcile gate", () => {
  it("defaults on in production-like env", () => {
    assert.equal(
      isReplicationReconcileEnabled({ NODE_ENV: "production" }),
      true,
    );
  });

  it("stays off for tests and explicit disable", () => {
    assert.equal(
      isReplicationReconcileEnabled({ NODE_ENV: "test" }),
      false,
    );
    assert.equal(
      isReplicationReconcileEnabled({ BACKSTEROS_INTEGRATION_TEST: "1" }),
      false,
    );
    assert.equal(
      isReplicationReconcileEnabled({ CORE_REPLICATION_RECONCILE: "false" }),
      false,
    );
  });
});
