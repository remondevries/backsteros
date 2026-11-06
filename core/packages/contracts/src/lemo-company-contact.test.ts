import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEMO_BANK_ACCOUNT,
  LEMO_COMPANY_NAME,
  LEMO_FINANCE_EMAIL,
  getLemoFinanceEmail,
  withLemoInvoiceSenderOverrides,
} from "./lemo-company-contact.js";

describe("lemo-company-contact", () => {
  it("returns locale finance inboxes", () => {
    assert.equal(getLemoFinanceEmail("nl"), "financieel@lemo-design.nl");
    assert.equal(getLemoFinanceEmail("NL"), "financieel@lemo-design.nl");
    assert.equal(getLemoFinanceEmail("en"), LEMO_FINANCE_EMAIL);
    assert.equal(getLemoFinanceEmail(null), LEMO_FINANCE_EMAIL);
    assert.equal(LEMO_FINANCE_EMAIL, "financials@lemo-design.com");
    assert.equal(LEMO_COMPANY_NAME, "Lemo-Design");
  });

  it("overrides Moneybird sender bank and email", () => {
    const party = withLemoInvoiceSenderOverrides(
      {
        bankAccountNumber: "NL00BANK0000000000",
        email: "old@moneybird.example",
      },
      "nl",
    );
    assert.equal(party.bankAccountNumber, LEMO_BANK_ACCOUNT);
    assert.equal(party.email, "financieel@lemo-design.nl");
  });
});
