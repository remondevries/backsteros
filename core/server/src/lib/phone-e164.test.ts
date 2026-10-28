import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dropNationalTrunkZero,
  normalizePhoneDigits,
  pickWhatsAppRecipientPhone,
  toE164PhoneNumber,
} from "./phone-e164.js";

describe("OS-146 E.164 phone normalisation", () => {
  it("strips spaces/dashes/dots/parentheses and drops national trunk 0", () => {
    assert.equal(
      normalizePhoneDigits("+31 (0)6 461 96 570"),
      "31646196570",
    );
    assert.equal(
      normalizePhoneDigits("+31 (0) 58 266 42 42"),
      "31582664242",
    );
    assert.equal(normalizePhoneDigits("+31646196570"), "31646196570");
    assert.equal(normalizePhoneDigits("+31582664242"), "31582664242");
    assert.equal(normalizePhoneDigits("+31 6 1234 5678"), "31612345678");
    assert.equal(normalizePhoneDigits("06-12345678"), "0612345678");
    assert.equal(normalizePhoneDigits("0031 (0)6 46196570"), "31646196570");
    assert.equal(normalizePhoneDigits(""), null);
  });

  it("matches stored E.164 against formatted query (lookup equality)", () => {
    const storedMobile = normalizePhoneDigits("+31646196570");
    const queryMobile = normalizePhoneDigits("+31 (0)6 461 96 570");
    assert.equal(storedMobile, queryMobile);

    const storedLandline = normalizePhoneDigits("+31582664242");
    const queryLandline = normalizePhoneDigits("+31 (0) 58 266 42 42");
    assert.equal(storedLandline, queryLandline);
  });

  it("toE164PhoneNumber formats Chatwoot-safe +digits", () => {
    assert.equal(toE164PhoneNumber("+31 (0)6 461 96 570"), "+31646196570");
    assert.equal(toE164PhoneNumber("+31646196570"), "+31646196570");
    assert.equal(toE164PhoneNumber(""), null);
    assert.equal(toE164PhoneNumber("abc"), null);
  });

  it("dropNationalTrunkZero is a no-op without a trunk 0", () => {
    assert.equal(dropNationalTrunkZero("31582664242"), "31582664242");
    assert.equal(dropNationalTrunkZero("31646196570"), "31646196570");
  });
});

describe("OS-146 WhatsApp recipient phone preference", () => {
  it("normalises landline with trunk 0 for sourceId digits", () => {
    const raw = pickWhatsAppRecipientPhone({
      phone: "+31 (0) 58 266 42 42",
      phones: [],
    });
    assert.equal(normalizePhoneDigits(raw), "31582664242");
  });

  it("prefers NL mobile over landline when several phones exist", () => {
    const raw = pickWhatsAppRecipientPhone({
      phone: "+31 (0) 58 266 42 42",
      phones: [
        { label: "work", number: "+31 (0) 58 266 42 42" },
        { label: "personal", number: "+31 (0)6 461 96 570" },
      ],
    });
    assert.equal(normalizePhoneDigits(raw), "31646196570");
  });

  it("prefers an explicit mobile/whatsapp label over primary landline", () => {
    const raw = pickWhatsAppRecipientPhone({
      phone: "+31582664242",
      phones: [
        { label: "whatsapp", number: "+31 6 1234 5678" },
        { label: "work", number: "+31582664242" },
      ],
    });
    assert.equal(normalizePhoneDigits(raw), "31612345678");
  });
});
