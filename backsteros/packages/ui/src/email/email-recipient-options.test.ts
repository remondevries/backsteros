import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEmailRecipientDropdownOptions,
  isPlausibleEmailAddress,
} from "./email-recipient-options.js";

describe("email-recipient-options", () => {
  it("accepts plausible freeform addresses", () => {
    assert.equal(isPlausibleEmailAddress("ada@example.com"), true);
    assert.equal(isPlausibleEmailAddress("Ada <ada@example.com>"), false);
    assert.equal(isPlausibleEmailAddress("ada@"), false);
    assert.equal(isPlausibleEmailAddress("not-an-email"), false);
  });

  it("builds one option per contact and organization email", () => {
    const options = buildEmailRecipientDropdownOptions({
      contacts: [
        {
          id: "c1",
          name: "Ada Lovelace",
          organizationName: "Analytical Engines",
          email: "ada@example.com",
          emails: [{ label: "work", address: "ada.work@example.com" }],
        },
      ],
      organizations: [
        {
          id: "o1",
          name: "Analytical Engines",
          email: "info@engines.example",
        },
      ],
    });
    assert.deepEqual(
      options.map((option) => option.value),
      ["ada@example.com", "ada.work@example.com", "info@engines.example"],
    );
    assert.equal(options[0]?.label, "Ada Lovelace");
    assert.equal(options[0]?.secondaryLabel, "(ada@example.com)");
    assert.equal(options[0]?.group, "Contacts");
    assert.match(options[0]?.searchTerms ?? "", /Analytical Engines/);
    assert.equal(options[2]?.label, "Analytical Engines");
    assert.equal(options[2]?.group, "Organizations");
  });

  it("parses organization emails when still a JSON string", () => {
    const options = buildEmailRecipientDropdownOptions({
      contacts: [],
      organizations: [
        {
          id: "o1",
          name: "Kifungo",
          email: "info@kifungo.nl",
          emails: JSON.stringify([
            { label: "support", address: "help@kifungo.nl" },
          ]),
        },
      ],
    });
    assert.deepEqual(
      options.map((option) => option.value),
      ["info@kifungo.nl", "help@kifungo.nl"],
    );
  });

  it("dedupes the same address across contact and organization", () => {
    const options = buildEmailRecipientDropdownOptions({
      contacts: [
        {
          id: "c1",
          name: "Ada",
          email: "shared@example.com",
        },
      ],
      organizations: [
        {
          id: "o1",
          name: "Org",
          email: "shared@example.com",
        },
      ],
    });
    assert.equal(options.length, 1);
    assert.equal(options[0]?.label, "Ada");
    assert.equal(options[0]?.group, "Contacts");
  });
});
