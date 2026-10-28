import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAgentMessageWebhookHeaders,
  encryptAgentMessageWebhookSecret,
  signAgentMessageBody,
  verifyAgentMessageSignature,
} from "../lib/agent-message-webhook.js";
import { deliverAgentMessageWebhookPayload } from "./agent-message-webhooks.js";

describe("OS-146 agent message webhook delivery signing", () => {
  it("builds HMAC headers agents can verify for chat and email events", () => {
    const secret = "whsec_delivery_test";
    for (const event of ["chat.message", "email.message"] as const) {
      const body = JSON.stringify({
        event,
        direction: "outbound",
        deliveryId: "d1",
      });
      const timestamp = "2026-10-28T12:00:00.000Z";
      const headers = buildAgentMessageWebhookHeaders({
        body,
        timestamp,
        secret,
        deliveryId: "d1",
      });
      const signature = signAgentMessageBody({ body, timestamp, secret });
      assert.equal(headers["x-backsteros-signature"], `sha256=${signature}`);
      assert.equal(
        verifyAgentMessageSignature({
          body,
          timestamp,
          secret,
          signature: headers["x-backsteros-signature"]!,
        }),
        true,
      );
    }
  });

  it("POSTs signed payloads to registered targets without hitting settings", async () => {
    const secret = "whsec_live_test";
    let posted: { url: string; signature: string | null; body: string } | null =
      null;
    const result = await deliverAgentMessageWebhookPayload(
      {
        event: "chat.message",
        direction: "inbound",
        workspaceId: "ws_1",
        conversationId: "conv-1",
        messageId: "msg-1",
        channel: "whatsapp",
        contentPreview: "hi",
        timestamp: "2026-10-28T12:00:00.000Z",
        deliveryId: "d-keep",
      },
      {
        listTargets: async () => [
          {
            id: "wh-1",
            url: "https://hooks.example/agent",
            secretCiphertext: encryptAgentMessageWebhookSecret(secret),
            events: ["chat.message"],
          },
        ],
        fetchImpl: async (url, init) => {
          const headers = new Headers(init?.headers);
          posted = {
            url: String(url),
            signature: headers.get("x-backsteros-signature"),
            body: String(init?.body ?? ""),
          };
          return new Response("ok", { status: 200 });
        },
        now: () => new Date("2026-10-28T12:00:00.000Z"),
      },
    );
    assert.equal(result.attempted, 1);
    assert.equal(result.delivered, 1);
    assert.ok(posted);
    assert.equal(posted.url, "https://hooks.example/agent");
    assert.ok(posted.signature?.startsWith("sha256="));
    assert.equal(
      verifyAgentMessageSignature({
        body: posted.body,
        timestamp: "2026-10-28T12:00:00.000Z",
        secret,
        signature: posted.signature!,
      }),
      true,
    );
    assert.match(posted.body, /"event":"chat.message"/);
  });
});
