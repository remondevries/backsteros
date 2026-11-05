import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  handleMoneybirdLateReminderWebhook,
  handleMoneybirdPaidCancelReminders,
  MONEYBIRD_LATE_ACTION,
  MONEYBIRD_PAID_ACTION,
  resetInvoiceReminderStateForTests,
} from "./moneybird-invoice-reminders.js";

describe("moneybird invoice reminders", () => {
  beforeEach(() => {
    resetInvoiceReminderStateForTests();
  });

  it("ignores unrelated actions on late handler", async () => {
    const result = await handleMoneybirdLateReminderWebhook({
      action: "sales_invoice_send_manually",
      entity_id: "123",
    });
    assert.equal(result.handled, false);
    assert.match(String(result.skipped), /ignored_action/);
  });

  it("requires an invoice id for late", async () => {
    await assert.rejects(
      () =>
        handleMoneybirdLateReminderWebhook({
          action: MONEYBIRD_LATE_ACTION,
        }),
      /missing sales invoice id/i,
    );
  });

  it("skips late reminders when invoice was not Manual/portal-sent", async () => {
    const result = await handleMoneybirdLateReminderWebhook({
      action: MONEYBIRD_LATE_ACTION,
      entity_id: "inv_email_only",
    });
    assert.equal(result.handled, true);
    assert.equal(result.skipped, "not_manual_send");
  });

  it("cancels pending reminders on paid", async () => {
    const result = await handleMoneybirdPaidCancelReminders({
      action: MONEYBIRD_PAID_ACTION,
      entity_id: "inv_1",
    });
    assert.equal(result.handled, true);
    assert.equal(result.invoiceId, "inv_1");
    assert.equal(result.skipped, "cancelled_pending");
  });
});
