import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
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
        emails: ["two@example.com", "one@example.com"],
      }),
      ["Primary <one@example.com>", "two@example.com"],
    );
  });

  it("matches any stored address", () => {
    const contact = {
      email: "one@example.com",
      emails: ["two@example.com"],
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
      emails: ["two@example.com"],
    };
    assert.equal(
      resolveContactEmailForAddress(contact, "two@example.com"),
      "two@example.com",
    );
  });

  it("normalizes additional emails away from the primary", () => {
    assert.deepEqual(
      normalizeContactEmailsInput({
        email: "one@example.com",
        emails: ["Two@Example.com", "three@example.com", "one@example.com"],
      }),
      {
        email: "one@example.com",
        emails: ["Two@Example.com", "three@example.com"],
      },
    );
  });
});
