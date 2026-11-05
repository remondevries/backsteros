import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  handleMoneybirdManualSendWebhook,
  MONEYBIRD_SEND_MANUALLY_ACTION,
} from "./moneybird-manual-send.js";

describe("handleMoneybirdManualSendWebhook", () => {
  it("ignores unrelated Moneybird actions", async () => {
    const result = await handleMoneybirdManualSendWebhook({
      action: "sales_invoice_state_changed_to_paid",
      entity_id: "123",
    });
    assert.equal(result.handled, false);
    assert.match(String(result.skipped), /ignored_action/);
  });

  it("requires an invoice id for Manual send", async () => {
    await assert.rejects(
      () =>
        handleMoneybirdManualSendWebhook({
          action: MONEYBIRD_SEND_MANUALLY_ACTION,
        }),
      /missing sales invoice id/i,
    );
  });
});
