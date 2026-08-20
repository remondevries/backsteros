import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { Webhook } from "svix";

import {
  clearWebhookDedupe,
  handleAgentMailWebhookDelivery,
  parseAgentMailWebhookPayload,
  rememberWebhookDelivery,
} from "./agentmail-webhook.js";
import {
  clearEmailUpdatedListeners,
  subscribeEmailUpdated,
} from "./email-inbox-events.js";

describe("agentmail-webhook", () => {
  beforeEach(() => {
    clearWebhookDedupe();
    clearEmailUpdatedListeners();
  });

  it("parses snake_case message.received payloads", () => {
    const parsed = parseAgentMailWebhookPayload({
      type: "event",
      event_type: "message.received",
      event_id: "evt_1",
      message: {
        inbox_id: "inbox_1",
        message_id: "msg_1",
      },
    });
    assert.deepEqual(parsed, {
      eventType: "message.received",
      eventId: "evt_1",
      inboxId: "inbox_1",
      messageId: "msg_1",
    });
  });

  it("rejects invalid signatures", () => {
    const result = handleAgentMailWebhookDelivery({
      rawBody: JSON.stringify({ event_type: "message.received" }),
      headers: {
        "svix-id": "msg_bad",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,deadbeef",
      },
      secrets: [
        {
          workspaceId: "ws_1",
          secret: "whsec_testsecretvaluetestsecretvalue12",
          inboxIds: ["inbox_1"],
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.equal(result.published, false);
  });

  it("publishes for selected inbox message.received", () => {
    const secret = "whsec_testsecretvaluetestsecretvalue12";
    const payload = {
      type: "event",
      event_type: "message.received",
      event_id: "evt_ok",
      message: { inbox_id: "inbox_1", message_id: "msg_1" },
    };
    const rawBody = JSON.stringify(payload);
    const wh = new Webhook(secret);
    const timestamp = String(Math.floor(Date.now() / 1000));
    // Svix sign helper: create signed headers via verify round-trip using
    // Webhook.sign when available; fall back to constructing via library.
    const msgId = "msg_delivery_1";
    const signature = (wh as unknown as { sign: (id: string, ts: Date, body: string) => string })
      .sign(msgId, new Date(Number(timestamp) * 1000), rawBody);

    const published: Array<{ inboxId: string; messageId: string | null }> = [];
    subscribeEmailUpdated("ws_1", (event) => {
      published.push({ inboxId: event.inboxId, messageId: event.messageId });
    });

    const result = handleAgentMailWebhookDelivery({
      rawBody,
      headers: {
        "svix-id": msgId,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      },
      secrets: [
        {
          workspaceId: "ws_1",
          secret,
          inboxIds: ["inbox_1"],
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.published, true);
    assert.deepEqual(published, [{ inboxId: "inbox_1", messageId: "msg_1" }]);
  });

  it("does not publish for unselected inboxes", () => {
    const secret = "whsec_testsecretvaluetestsecretvalue12";
    const payload = {
      event_type: "message.received",
      event_id: "evt_other",
      message: { inbox_id: "inbox_other", message_id: "msg_2" },
    };
    const rawBody = JSON.stringify(payload);
    const wh = new Webhook(secret);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const msgId = "msg_delivery_2";
    const signature = (wh as unknown as { sign: (id: string, ts: Date, body: string) => string })
      .sign(msgId, new Date(Number(timestamp) * 1000), rawBody);

    let count = 0;
    subscribeEmailUpdated("ws_1", () => {
      count += 1;
    });

    const result = handleAgentMailWebhookDelivery({
      rawBody,
      headers: {
        "svix-id": msgId,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      },
      secrets: [
        {
          workspaceId: "ws_1",
          secret,
          inboxIds: ["inbox_1"],
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.published, false);
    assert.equal(count, 0);
  });

  it("dedupes repeated delivery ids", () => {
    assert.equal(rememberWebhookDelivery("dup_1"), false);
    assert.equal(rememberWebhookDelivery("dup_1"), true);
  });
});
