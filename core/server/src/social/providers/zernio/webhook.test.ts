import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import {
  extractZernioEventId,
  translateZernioWebhook,
  verifyZernioWebhookSignature,
} from "./webhook.js";

describe("zernio webhook signature", () => {
  it("accepts hex HMAC-SHA256", () => {
    const secret = "test-secret";
    const body = '{"event":"comment.received"}';
    const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    assert.equal(verifyZernioWebhookSignature(secret, body, hex), true);
  });

  it("accepts sha256= prefix", () => {
    const secret = "test-secret";
    const body = '{"event":"message.received"}';
    const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    assert.equal(
      verifyZernioWebhookSignature(secret, body, `sha256=${hex}`),
      true,
    );
  });

  it("rejects invalid signatures", () => {
    assert.equal(
      verifyZernioWebhookSignature("secret", "{}", "deadbeef"),
      false,
    );
  });
});

describe("zernio webhook translate", () => {
  it("maps comment.received to normalized event", () => {
    const body = JSON.stringify({
      event: "comment.received",
      data: {
        accountId: "acc1",
        postId: "post1",
        comment: {
          id: "c1",
          message: "Hello",
          authorUsername: "alice",
          createdAt: "2026-10-07T12:00:00.000Z",
        },
      },
    });
    const headers = {
      "x-zernio-event-id": "evt-1",
      "x-zernio-event-type": "comment.received",
    };
    const events = translateZernioWebhook(headers, body, {
      workspaceId: "ws1",
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]!.type, "comment.received");
    if (events[0]!.type === "comment.received") {
      assert.equal(events[0]!.eventId, "evt-1");
      assert.equal(events[0]!.comment.text, "Hello");
      assert.equal(events[0]!.comment.authorHandle, "alice");
    }
  });

  it("maps account.disconnected", () => {
    const body = JSON.stringify({
      type: "account.disconnected",
      accountId: "acc-disconnected",
    });
    const headers = { "x-zernio-event-id": "evt-2" };
    const events = translateZernioWebhook(headers, body, {
      workspaceId: "ws1",
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]!.type, "account.disconnected");
    if (events[0]!.type === "account.disconnected") {
      assert.equal(events[0]!.externalAccountId, "acc-disconnected");
    }
  });

  it("reads event id from header", () => {
    assert.equal(
      extractZernioEventId({ "x-zernio-event-id": " abc " }, {}),
      "abc",
    );
  });
});
