import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  coerceContactPhoneEntries,
  contactPhoneRowsForEditor,
  getContactPhoneNumbers,
  normalizeContactPhonesInput,
  normalizePhoneKey,
  splitContactPhoneRows,
} from "./contact-phones.js";

describe("contact phones", () => {
  it("normalizes phone keys for dedup", () => {
    assert.equal(normalizePhoneKey("+31 6 15 50 80 80"), "+31615508080");
    assert.equal(normalizePhoneKey("(06) 15-50-8080"), "0615508080");
  });

  it("collects primary and additional numbers without duplicates", () => {
    assert.deepEqual(
      getContactPhoneNumbers({
        phone: "+31 6 1550 8080",
        phones: [
          { label: "work", number: "020 123 4567" },
          { label: "personal", number: "+31615508080" },
        ],
      }),
      ["+31 6 1550 8080", "020 123 4567"],
    );
  });

  it("accepts legacy string additional phones", () => {
    assert.deepEqual(coerceContactPhoneEntries(["020 123 4567"]), [
      { label: "other", number: "020 123 4567" },
    ]);
  });

  it("parses PowerSync JSON-string phones instead of treating chars as numbers", () => {
    assert.deepEqual(coerceContactPhoneEntries("[]"), []);
    assert.deepEqual(
      getContactPhoneNumbers({ phone: null, phones: "[]" }),
      [],
    );
    assert.deepEqual(
      getContactPhoneNumbers({
        phone: null,
        phones: '[{"label":"work","number":"0201234567"}]',
      }),
      ["0201234567"],
    );
  });

  it("keeps additional phones and synthesizes a labeled primary when omitted", () => {
    assert.deepEqual(
      normalizeContactPhonesInput({
        phone: "0612345678",
        phones: [{ label: "work", number: "0201234567" }],
      }),
      {
        phone: "0612345678",
        phones: [
          { label: "personal", number: "0612345678" },
          { label: "work", number: "0201234567" },
        ],
      },
    );
  });

  it("reuses the stored primary label when present in phones", () => {
    assert.deepEqual(
      contactPhoneRowsForEditor({
        phone: "0612345678",
        phones: [
          { label: "work", number: "0612345678" },
          { label: "personal", number: "0201234567" },
        ],
      }),
      [
        { label: "work", number: "0612345678" },
        { label: "personal", number: "0201234567" },
      ],
    );
  });

  it("synthesizes a personal primary row when phones omit it", () => {
    assert.deepEqual(
      contactPhoneRowsForEditor({
        phone: "0612345678",
        phones: [{ label: "work", number: "0201234567" }],
      }),
      [
        { label: "personal", number: "0612345678" },
        { label: "work", number: "0201234567" },
      ],
    );
  });

  it("splits editor rows into primary + phones", () => {
    assert.deepEqual(
      splitContactPhoneRows([
        { label: "work", number: " 0612345678 " },
        { label: "personal", number: "0201234567" },
        { label: "other", number: "" },
      ]),
      {
        phone: "0612345678",
        phones: [
          { label: "work", number: "0612345678" },
          { label: "personal", number: "0201234567" },
        ],
      },
    );
  });
});
