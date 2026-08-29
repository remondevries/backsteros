import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  coerceContactEmailEntries,
  contactMatchesEmailAddress,
  findContactByEmailAddress,
  getContactEmailAddresses,
  normalizeContactEmailsInput,
  parseBareEmailAddress,
  resolveContactEmailForAddress,
} from "@backsteros/contracts";

describe("contact emails", () => {
  it("parses bare addresses from display names", () => {
    assert.equal(parseBareEmailAddress("Ada Lovelace <ada@example.com>"), "ada@example.com");
    assert.equal(parseBareEmailAddress("bob@example.com"), "bob@example.com");
  });

  it("collects primary and additional addresses without duplicates", () => {
    assert.deepEqual(
      getContactEmailAddresses({
        email: "Primary <one@example.com>",
        emails: [
          { label: "work", address: "two@example.com" },
          { label: "personal", address: "one@example.com" },
        ],
      }),
      ["Primary <one@example.com>", "two@example.com"],
    );
  });

  it("accepts legacy string additional emails", () => {
    assert.deepEqual(
      coerceContactEmailEntries(["two@example.com"]),
      [{ label: "other", address: "two@example.com" }],
    );
    assert.deepEqual(
      getContactEmailAddresses({
        email: "one@example.com",
        emails: ["two@example.com"],
      }),
      ["one@example.com", "two@example.com"],
    );
  });

  it("matches any stored address", () => {
    const contact = {
      email: "one@example.com",
      emails: [{ label: "work" as const, address: "two@example.com" }],
    };
    assert.equal(contactMatchesEmailAddress(contact, "Two <two@example.com>"), true);
    assert.equal(contactMatchesEmailAddress(contact, "three@example.com"), false);
    assert.equal(
      findContactByEmailAddress([contact], "two@example.com")?.email,
      "one@example.com",
    );
  });

  it("resolves the matched address for display", () => {
    const contact = {
      email: "one@example.com",
      emails: [{ label: "personal" as const, address: "two@example.com" }],
    };
    assert.equal(
      resolveContactEmailForAddress(contact, "two@example.com"),
      "two@example.com",
    );
  });

  it("keeps a labeled primary row inside emails for the type dropdown", () => {
    assert.deepEqual(
      normalizeContactEmailsInput({
        email: "one@example.com",
        emails: [
          { label: "Work", address: "Two@Example.com" },
          { label: "personal", address: "three@example.com" },
          "one@example.com",
        ],
      }),
      {
        email: "one@example.com",
        emails: [
          { label: "work", address: "Two@Example.com" },
          { label: "personal", address: "three@example.com" },
          { label: "other", address: "one@example.com" },
        ],
      },
    );
  });

  it("synthesizes a personal primary row when emails omit it", () => {
    assert.deepEqual(
      normalizeContactEmailsInput({
        email: "one@example.com",
        emails: [{ label: "work", address: "two@example.com" }],
      }),
      {
        email: "one@example.com",
        emails: [
          { label: "personal", address: "one@example.com" },
          { label: "work", address: "two@example.com" },
        ],
      },
    );
  });
});
