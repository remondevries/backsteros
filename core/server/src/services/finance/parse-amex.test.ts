import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAmexCsv } from "./parse-amex.js";

const SAMPLE = `Datum,Omschrijving,Bedrag,Aanvullende informatie,Vermeld op uw rekeningoverzicht als,Adres,Plaats,Postcode,Land,Referentie
06/16/2026,BUITEN GERECHTELIJKE INCASSOKOSTEN,"21,73",,BUITEN,,,,,'10000000010616999678300'
06/15/2026,OBSIDIAN,"5,37","Foreign Spend Amount: 6.05",OBSIDIAN,,CANADA,,,'AT261670023000010017742'
06/11/2026,CREDIT AANPASSING,"-17,78",,CREDIT,,,,,'10000000010816998756230'
`;

describe("parseAmexCsv", () => {
  it("parses US dates, signed amounts, and Referentie", () => {
    const result = parseAmexCsv(SAMPLE);
    assert.equal(result.dialect, "amex_nl");
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows[0]!.bookedOn, "2026-06-16");
    assert.equal(result.rows[0]!.amountCents, 2173);
    assert.equal(result.rows[0]!.externalId, "10000000010616999678300");
    assert.equal(result.rows[2]!.amountCents, -1778);
    assert.equal(result.rows[1]!.bookedOn, "2026-06-15");
  });

  it("handles multiline address fields", () => {
    const multiline = `Datum,Omschrijving,Bedrag,Aanvullende informatie,Vermeld op uw rekeningoverzicht als,Adres,Plaats,Postcode,Land,Referentie
06/10/2026,SHOP,"12,00",,SHOP,"Line 1
Line 2",CITY,1234,NL,'REFMULTILINE001'
`;
    const result = parseAmexCsv(multiline);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]!.externalId, "REFMULTILINE001");
    assert.equal(result.rows[0]!.amountCents, 1200);
  });
});
