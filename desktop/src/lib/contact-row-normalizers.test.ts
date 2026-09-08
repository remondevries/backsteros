import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeContactEmails,
  normalizeContactPhones,
  sanitizeContactChannelPatch,
  sanitizeOrganizationChannelPatch,
} from "./contact-row-normalizers";

describe("normalizeContactEmails", () => {
  it("accepts arrays and PowerSync JSON strings", () => {
    const rows = [{ address: "a@x.io", label: "work" }];
    assert.deepEqual(normalizeContactEmails(rows), [
      { label: "work", address: "a@x.io" },
    ]);
    assert.deepEqual(
      normalizeContactEmails(JSON.stringify(rows)),
      normalizeContactEmails(rows),
    );
  });

  it("tolerates legacy shapes and falls back to label 'other'", () => {
    assert.deepEqual(
      normalizeContactEmails(["  b@x.io ", { email: "c@x.io", label: "HOME" }]),
      [
        { label: "other", address: "b@x.io" },
        { label: "other", address: "c@x.io" },
      ],
    );
  });

  it("dedupes case-insensitively and drops blanks", () => {
    assert.deepEqual(
      normalizeContactEmails([
        { address: "A@x.io" },
        { address: "a@x.io" },
        { address: "" },
        null,
      ]),
      [{ label: "other", address: "A@x.io" }],
    );
  });

  it("returns [] for malformed input and caps at 20", () => {
    assert.deepEqual(normalizeContactEmails("{not json"), []);
    assert.deepEqual(normalizeContactEmails({ address: "x" }), []);
    assert.deepEqual(normalizeContactEmails(null), []);
    const many = Array.from({ length: 25 }, (_, i) => `u${i}@x.io`);
    assert.equal(normalizeContactEmails(many).length, 20);
  });
});

describe("normalizeContactPhones", () => {
  it("accepts `number` and legacy `phone` keys", () => {
    assert.deepEqual(
      normalizeContactPhones([
        { number: "+31 6 1234 5678", label: "personal" },
        { phone: "020-123", label: "work" },
      ]),
      [
        { label: "personal", number: "+31 6 1234 5678" },
        { label: "work", number: "020-123" },
      ],
    );
  });

  it("dedupes by digits/plus only, keeping the first formatting", () => {
    assert.deepEqual(
      normalizeContactPhones(["+31 6 1234 5678", "+31612345678", "(0)20 123"]),
      [
        { label: "other", number: "+31 6 1234 5678" },
        { label: "other", number: "(0)20 123" },
      ],
    );
  });

  it("drops entries with no digits and malformed input", () => {
    assert.deepEqual(normalizeContactPhones(["---", ""]), []);
    assert.deepEqual(normalizeContactPhones("[oops"), []);
    assert.deepEqual(normalizeContactPhones(undefined), []);
  });
});

describe("sanitizeContactChannelPatch", () => {
  it("clears empty and incomplete emails", () => {
    assert.deepEqual(
      sanitizeContactChannelPatch({
        email: "",
        emails: [
          { label: "work", address: "ok@x.io" },
          { label: "personal", address: "not-an-email" },
          { label: "other", address: "" },
        ],
      }),
      {
        email: null,
        emails: [{ label: "work", address: "ok@x.io" }],
      },
    );
  });

  it("clears blank phones and keeps labeled numbers", () => {
    assert.deepEqual(
      sanitizeContactChannelPatch({
        phone: "  ",
        phones: [
          { label: "work", number: "+316" },
          { label: "personal", number: "" },
        ],
      }),
      {
        phone: null,
        phones: [{ label: "work", number: "+316" }],
      },
    );
  });
});

describe("sanitizeOrganizationChannelPatch", () => {
  it("keeps org labels and clears bad website/email", () => {
    assert.deepEqual(
      sanitizeOrganizationChannelPatch({
        email: "not-valid",
        emails: [
          { label: "support", address: "help@x.io" },
          { label: "personal", address: "a@x.io" },
        ],
        website: "not a url",
      }),
      {
        email: null,
        emails: [
          { label: "support", address: "help@x.io" },
          { label: "other", address: "a@x.io" },
        ],
        website: null,
      },
    );
  });
});
