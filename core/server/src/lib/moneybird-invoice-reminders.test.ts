import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  getInvoiceReminderTrackSnapshot,
  handleMoneybirdLateReminderWebhook,
  handleMoneybirdPaidCancelReminders,
  MONEYBIRD_LATE_ACTION,
  MONEYBIRD_PAID_ACTION,
  MONEYBIRD_REMINDER_WEBHOOK_EVENTS,
  reconcilePaidOpenReminderTracks,
  registerManualPortalInvoiceForReminders,
  resetInvoiceReminderStateForTests,
  sendInvoiceReminderManually,
  setInvoicePaidLookupForTests,
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

  it("keys paid cancel on Moneybird entity id, not printed invoice number", async () => {
    await registerManualPortalInvoiceForReminders("503278967163192923", "nl");
    const wrong = await handleMoneybirdPaidCancelReminders({
      action: MONEYBIRD_PAID_ACTION,
      entity_id: "2026-0244",
      entity: { id: "2026-0244", invoice_id: "2026-0244" },
    });
    assert.equal(wrong.invoiceId, "2026-0244");
    const stillOpen = await getInvoiceReminderTrackSnapshot(
      "503278967163192923",
    );
    assert.equal(stillOpen?.cancelledAt, null);
    assert.equal(stillOpen?.nextStep, 1);

    const right = await handleMoneybirdPaidCancelReminders({
      action: MONEYBIRD_PAID_ACTION,
      entity_id: "503278967163192923",
      entity: { id: "503278967163192923", invoice_id: "2026-0244" },
    });
    assert.equal(right.invoiceId, "503278967163192923");
    const cancelled = await getInvoiceReminderTrackSnapshot(
      "503278967163192923",
    );
    assert.ok(cancelled?.cancelledAt);
    assert.equal(cancelled?.nextStep, null);
  });

  it("reconcile cancels open tracks when Moneybird reports paid", async () => {
    await registerManualPortalInvoiceForReminders("inv_paid", "nl");
    await registerManualPortalInvoiceForReminders("inv_open", "nl");
    setInvoicePaidLookupForTests(async (invoiceId) =>
      invoiceId === "inv_paid" ? "paid" : "open",
    );
    const result = await reconcilePaidOpenReminderTracks({ limit: 10 });
    assert.equal(result.checked, 2);
    assert.deepEqual(result.cancelled, ["inv_paid"]);
    assert.ok(
      (await getInvoiceReminderTrackSnapshot("inv_paid"))?.cancelledAt,
    );
    assert.equal(
      (await getInvoiceReminderTrackSnapshot("inv_open"))?.cancelledAt,
      null,
    );
  });

  it("documents required Moneybird webhook events for the ladder", () => {
    assert.ok(
      MONEYBIRD_REMINDER_WEBHOOK_EVENTS.includes(MONEYBIRD_PAID_ACTION),
    );
    assert.ok(
      MONEYBIRD_REMINDER_WEBHOOK_EVENTS.includes(MONEYBIRD_LATE_ACTION),
    );
    assert.ok(
      MONEYBIRD_REMINDER_WEBHOOK_EVENTS.includes(
        "sales_invoice_send_manually",
      ),
    );
  });

  it("exposes portal track snapshot after Manual registration", async () => {
    await registerManualPortalInvoiceForReminders("inv_snap", "nl");
    const snap = await getInvoiceReminderTrackSnapshot("inv_snap");
    assert.ok(snap);
    assert.equal(snap?.eligibleFromManualSend, true);
    assert.equal(snap?.nextStep, 1);
    assert.ok(snap?.portalInvoiceSentAt);
  });

  it("manual reminder send reports transport failure after eligibility", async () => {
    const result = await sendInvoiceReminderManually({
      invoiceId: "inv_manual_send",
      locale: "nl",
    });
    assert.equal(result.ok, false);
    assert.equal(result.step, 1);
    assert.ok(result.error);
  });
});
