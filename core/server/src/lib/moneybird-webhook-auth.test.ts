import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, describe, it } from "node:test";

import {
  authorizeMoneybirdWebhook,
  verifyMoneybirdWebhookSignature,
  verifyMoneybirdWebhookToken,
} from "./moneybird-webhook-auth.js";

describe("moneybird webhook auth", () => {
  afterEach(() => {
    delete process.env.MONEYBIRD_WEBHOOK_TOKEN;
    delete process.env.MONEYBIRD_WEBHOOK_SECRET;
  });

  it("verifies the payload webhook token", () => {
    process.env.MONEYBIRD_WEBHOOK_TOKEN = "tok_test_123";
    assert.equal(verifyMoneybirdWebhookToken("tok_test_123"), true);
    assert.equal(verifyMoneybirdWebhookToken("wrong"), false);
    assert.equal(verifyMoneybirdWebhookToken(null), false);
  });

  it("verifies Moneybird-Signature HMAC", () => {
    const secret = "whsec_test";
    process.env.MONEYBIRD_WEBHOOK_SECRET = secret;
    const rawBody = '{"action":"sales_invoice_send_manually"}';
    const t = String(Math.floor(Date.now() / 1000));
    const v1 = createHmac("sha256", secret)
      .update(`${t}.${rawBody}`)
      .digest("hex");

    assert.equal(
      verifyMoneybirdWebhookSignature(rawBody, `t=${t},v1=${v1}`),
      true,
    );
    assert.equal(
      verifyMoneybirdWebhookSignature(rawBody, `t=${t},v1=deadbeef`),
      false,
    );
  });

  it("authorizes with token only when secret is unset", () => {
    process.env.MONEYBIRD_WEBHOOK_TOKEN = "tok_test_123";
    assert.equal(
      authorizeMoneybirdWebhook({
        rawBody: "{}",
        signatureHeader: null,
        payloadToken: "tok_test_123",
      }),
      true,
    );
    assert.equal(
      authorizeMoneybirdWebhook({
        rawBody: "{}",
        signatureHeader: null,
        payloadToken: "nope",
      }),
      false,
    );
  });
});
