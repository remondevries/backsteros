import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contactLookupQuerySchema } from "@backsteros/contracts";

import { normalizePhoneDigits } from "../lib/phone-e164.js";
import { lookupContactByChannel } from "./crm-domain/organizations-contacts.js";

describe("OS-146 contact lookup helpers", () => {
  it("normalizes phone digits for E.164-ish matching", () => {
    assert.equal(normalizePhoneDigits("+31 6 1234 5678"), "31612345678");
    assert.equal(
      normalizePhoneDigits("+31 (0)6 461 96 570"),
      "31646196570",
    );
    assert.equal(
      normalizePhoneDigits("+31 (0) 58 266 42 42"),
      "31582664242",
    );
    assert.equal(normalizePhoneDigits("06-12345678"), "0612345678");
    assert.equal(normalizePhoneDigits(""), null);
  });

  it("accepts email= and channel=email in the lookup query schema", () => {
    assert.equal(
      contactLookupQuerySchema.safeParse({ email: "Jan@Example.com" }).success,
      true,
    );
    assert.equal(
      contactLookupQuerySchema.safeParse({
        channel: "email",
        value: "jan@example.com",
      }).success,
      true,
    );
  });

  it("lookupContactByChannel accepts phone / email / xUserId / handle filters", async () => {
    // Empty workspace — function runs the query path without throwing on bad filters.
    const miss = await lookupContactByChannel("ws_missing_os146", {
      phone: "+31 (0)6 461 96 570",
    });
    assert.equal(miss, null);

    const missWhatsApp = await lookupContactByChannel("ws_missing_os146", {
      channel: "whatsapp",
      value: "+31 (0) 58 266 42 42",
    });
    assert.equal(missWhatsApp, null);

    const missEmail = await lookupContactByChannel("ws_missing_os146", {
      email: "nobody@example.com",
    });
    assert.equal(missEmail, null);

    const missEmailChannel = await lookupContactByChannel("ws_missing_os146", {
      channel: "email",
      value: "Nobody@Example.com",
    });
    assert.equal(missEmailChannel, null);

    const missX = await lookupContactByChannel("ws_missing_os146", {
      xUserId: "999999",
    });
    assert.equal(missX, null);

    const missIg = await lookupContactByChannel("ws_missing_os146", {
      channel: "instagram",
      value: "@nobody",
    });
    assert.equal(missIg, null);
  });
});

describe("OS-146 contact lookup email matching (pure)", () => {
  it("matches email case-insensitively across email and emails[]", async () => {
    const { contactMatchesEmailAddress } = await import("@backsteros/contracts");
    assert.equal(
      contactMatchesEmailAddress(
        {
          email: "Jan@Example.com",
          emails: [{ label: "work", address: "office@Example.com" }],
        },
        "jan@example.com",
      ),
      true,
    );
    assert.equal(
      contactMatchesEmailAddress(
        {
          email: null,
          emails: [{ label: "personal", address: "Office@Example.com" }],
        },
        "office@example.com",
      ),
      true,
    );
    assert.equal(
      contactMatchesEmailAddress(
        { email: "jan@example.com", emails: [] },
        "other@example.com",
      ),
      false,
    );
  });
});
