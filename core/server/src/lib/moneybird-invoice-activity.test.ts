import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildInvoiceActivityItems } from "./moneybird-invoice-activity.js";

describe("moneybird invoice activity", () => {
  it("merges Moneybird send events with portal reminder track", () => {
    const items = buildInvoiceActivityItems({
      invoiceId: "inv_1",
      moneybirdEvents: [
        {
          action: "sales_invoice_send_email",
          createdAt: "2026-01-01T10:00:00.000Z",
          userId: "u1",
        },
        {
          action: "sales_invoice_updated",
          createdAt: "2026-01-01T09:00:00.000Z",
          userId: null,
        },
      ],
      track: {
        eligibleFromManualSend: true,
        portalInvoiceSentAt: "2026-01-02T10:00:00.000Z",
        portalInvoiceMessageId: "msg_invoice",
        portalInvoiceInboxId: "inbox_invoice",
        portalInvoiceTo: "billing@example.com",
        locale: "nl",
        cancelledAt: null,
        lastStep: 1,
        nextStep: 2,
        reminders: [
          {
            step: 1,
            sentAt: "2026-01-12T10:00:00.000Z",
            messageId: "msg_r1",
            inboxId: "inbox_r1",
            to: "billing@example.com",
          },
        ],
        dueAt: { 2: "2026-01-22T10:00:00.000Z" },
      },
    });

    assert.equal(items.length, 3);
    assert.equal(items[0]?.kind, "reminder_sent");
    assert.equal(items[0]?.channel, "portal_email");
    assert.equal(items[0]?.step, 1);
    assert.equal(items[0]?.label, "1st reminder sent: billing@example.com");
    assert.equal(items[0]?.to, "billing@example.com");
    assert.equal(items[0]?.agentMailMessageId, "msg_r1");
    assert.equal(items[0]?.agentMailInboxId, "inbox_r1");
    assert.equal(items[1]?.kind, "invoice_sent");
    assert.equal(items[1]?.channel, "portal_email");
    assert.equal(items[1]?.label, "Invoice sent: billing@example.com");
    assert.equal(items[1]?.to, "billing@example.com");
    assert.equal(items[1]?.agentMailMessageId, "msg_invoice");
    assert.equal(items[1]?.agentMailInboxId, "inbox_invoice");
    assert.equal(items[2]?.kind, "invoice_sent");
    assert.equal(items[2]?.channel, "moneybird_email");
    assert.equal(items[2]?.agentMailMessageId, null);
  });
});
