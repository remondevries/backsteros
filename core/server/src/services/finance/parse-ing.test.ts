import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseIngCsv } from "./parse-ing.js";

const SAMPLE = `"Date";"Name / Description";"Account";"Counterparty";"Code";"Debit/credit";"Amount (EUR)";"Transaction type";"Notifications";"Resulting balance";"Tag"
"20260725";"Albert Heijn 1513";"NL80INGB0008304884";"";"BA";"Debit";"11,58";"Payment terminal";"Card sequence no.: 900";"2112,89";""
"20260615";"Reset4U";"NL80INGB0008304884";"NL42KNAB0000002618";"OV";"Credit";"54,45";"Transfer";"Reference: RF27Q2W46JQS";"2816,78";""
`;

describe("parseIngCsv", () => {
  it("parses debit/credit and dates", () => {
    const result = parseIngCsv(SAMPLE);
    assert.equal(result.dialect, "ing_nl");
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0]!.bookedOn, "2026-07-25");
    assert.equal(result.rows[0]!.amountCents, -1158);
    assert.equal(result.rows[0]!.payee, "Albert Heijn 1513");
    assert.equal(result.rows[1]!.amountCents, 5445);
    assert.equal(result.rows[1]!.counterparty, "NL42KNAB0000002618");
    assert.ok(result.rows[0]!.fingerprint);
    assert.notEqual(result.rows[0]!.fingerprint, result.rows[1]!.fingerprint);
  });
});
