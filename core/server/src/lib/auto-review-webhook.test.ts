import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTO_REVIEW_BACKOFF_MS,
  AUTO_REVIEW_MAX_ATTEMPTS,
  backoffMsAfterAttempt,
  classifyWebhookResponse,
  decryptWebhookSecret,
  encryptWebhookSecret,
  maskWebhookSecret,
  nextAttemptAt,
  parseRetryAfterMs,
  shouldDeliverAutoReviewWebhooks,
  shouldEnqueueAutoReview,
  signAutoReviewBody,
  verifyAutoReviewSignature,
} from "./auto-review-webhook.js";

describe("auto-review webhook helpers", () => {
  it("builds payload gating: toggle off, already in_review, completed, skipActivity", () => {
    const base = {
      skipActivitySideEffects: false,
      webhookEnabled: true,
      automateCompletion: true,
      previousStatus: "in_progress",
      nextStatus: "in_review",
    };
    assert.equal(shouldEnqueueAutoReview(base), true);
    assert.equal(
      shouldEnqueueAutoReview({ ...base, automateCompletion: false }),
      false,
    );
    assert.equal(
      shouldEnqueueAutoReview({ ...base, webhookEnabled: false }),
      false,
    );
    assert.equal(
      shouldEnqueueAutoReview({ ...base, previousStatus: "in_review" }),
      false,
    );
    assert.equal(
      shouldEnqueueAutoReview({ ...base, nextStatus: "completed" }),
      false,
    );
    assert.equal(
      shouldEnqueueAutoReview({ ...base, skipActivitySideEffects: true }),
      false,
    );
    assert.equal(
      shouldEnqueueAutoReview({
        ...base,
        previousStatus: "completed",
        nextStatus: "in_review",
      }),
      true,
    );
  });

  it("uses exponential backoff 1m, 5m, 15m, 1h, 6h and caps at 6 attempts", () => {
    assert.deepEqual([...AUTO_REVIEW_BACKOFF_MS], [
      60_000, 300_000, 900_000, 3_600_000, 21_600_000,
    ]);
    assert.equal(AUTO_REVIEW_MAX_ATTEMPTS, 6);
    assert.equal(backoffMsAfterAttempt(1), 60_000);
    assert.equal(backoffMsAfterAttempt(5), 21_600_000);
    assert.equal(backoffMsAfterAttempt(9), 21_600_000);
    const at = nextAttemptAt({
      failedAttempt: 1,
      retryAfterMs: null,
      now: new Date("2026-10-06T12:00:00.000Z"),
    });
    assert.equal(at.toISOString(), "2026-10-06T12:01:00.000Z");
  });

  it("retries 5xx/timeout/network and 408/429, not other 4xx", () => {
    assert.equal(
      classifyWebhookResponse({
        httpStatus: 200,
        networkError: false,
        timeout: false,
      }),
      "success",
    );
    assert.equal(
      classifyWebhookResponse({
        httpStatus: 500,
        networkError: false,
        timeout: false,
      }),
      "retry",
    );
    assert.equal(
      classifyWebhookResponse({
        httpStatus: null,
        networkError: true,
        timeout: false,
      }),
      "retry",
    );
    assert.equal(
      classifyWebhookResponse({
        httpStatus: null,
        networkError: false,
        timeout: true,
      }),
      "retry",
    );
    assert.equal(
      classifyWebhookResponse({
        httpStatus: 429,
        networkError: false,
        timeout: false,
      }),
      "retry",
    );
    assert.equal(
      classifyWebhookResponse({
        httpStatus: 408,
        networkError: false,
        timeout: false,
      }),
      "retry",
    );
    assert.equal(
      classifyWebhookResponse({
        httpStatus: 400,
        networkError: false,
        timeout: false,
      }),
      "dead",
    );
    assert.equal(
      classifyWebhookResponse({
        httpStatus: 401,
        networkError: false,
        timeout: false,
      }),
      "dead",
    );
  });

  it("honours Retry-After seconds and HTTP-date", () => {
    assert.equal(parseRetryAfterMs("120"), 120_000);
    const now = Date.parse("2026-10-06T12:00:00.000Z");
    assert.equal(
      parseRetryAfterMs("Tue, 06 Oct 2026 12:05:00 GMT", now),
      5 * 60_000,
    );
    const delayed = nextAttemptAt({
      failedAttempt: 1,
      retryAfterMs: 10 * 60_000,
      now: new Date("2026-10-06T12:00:00.000Z"),
    });
    assert.equal(delayed.toISOString(), "2026-10-06T12:10:00.000Z");
  });

  it("encrypts secrets and never masks with the raw value", () => {
    const env = { BACKSTEROS_SECRET_ENCRYPTION_KEY: "unit-test-key" };
    const cipher = encryptWebhookSecret("super-secret-token", env);
    assert.equal(cipher.startsWith("v1:"), true);
    assert.equal(cipher.includes("super-secret-token"), false);
    assert.equal(decryptWebhookSecret(cipher, env), "super-secret-token");
    assert.equal(maskWebhookSecret("super-secret-token"), "••••oken");
  });

  it("HMAC-signs body + timestamp", () => {
    const body = '{"event":"task.ready_for_review"}';
    const timestamp = "2026-10-06T12:00:00.000Z";
    const secret = "hook-secret";
    const sig = signAutoReviewBody({ body, timestamp, secret });
    assert.equal(
      verifyAutoReviewSignature({ body, timestamp, secret, signature: sig }),
      true,
    );
    assert.equal(
      verifyAutoReviewSignature({
        body,
        timestamp,
        secret: "other",
        signature: sig,
      }),
      false,
    );
  });

  it("only cloud/standalone cores deliver (never local)", () => {
    assert.equal(shouldDeliverAutoReviewWebhooks({}), true);
    assert.equal(
      shouldDeliverAutoReviewWebhooks({ CORE_REPLICATION_ROLE: "cloud" }),
      true,
    );
    assert.equal(
      shouldDeliverAutoReviewWebhooks({ CORE_REPLICATION_ROLE: "local" }),
      false,
    );
  });
});
