import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  handleMoneybirdLateReminderWebhook,
  handleMoneybirdPaidCancelReminders,
  MONEYBIRD_LATE_ACTION,
  MONEYBIRD_PAID_ACTION,
  registerManualPortalInvoiceForReminders,
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

  it("treats Manual registration as eligible (memory mode)", async () => {
    await registerManualPortalInvoiceForReminders("inv_manual", "nl");
    // Passing the Manual gate attempts a real send — expect a transport/API error,
    // not not_manual_send.
    await assert.rejects(
      () =>
        handleMoneybirdLateReminderWebhook({
          action: MONEYBIRD_LATE_ACTION,
          entity_id: "inv_manual",
          entity: { language: "nl" },
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.doesNotMatch(err.message, /not_manual_send|not sent via Manual/i);
        return true;
      },
    );
  });

  it("cancels pending reminders on paid", async () => {
    await registerManualPortalInvoiceForReminders("inv_1", "nl");
    const result = await handleMoneybirdPaidCancelReminders({
      action: MONEYBIRD_PAID_ACTION,
      entity_id: "inv_1",
    });
    assert.equal(result.handled, true);
    assert.equal(result.invoiceId, "inv_1");
    assert.equal(result.skipped, "cancelled_pending");

    const late = await handleMoneybirdLateReminderWebhook({
      action: MONEYBIRD_LATE_ACTION,
      entity_id: "inv_1",
    });
    assert.equal(late.skipped, "cancelled");
  });
});
