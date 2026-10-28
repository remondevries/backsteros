import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizePhoneDigits } from "./chat-create-conversation.js";
import { lookupContactByChannel } from "./crm-domain/organizations-contacts.js";

describe("OS-146 contact lookup helpers", () => {
  it("normalizes phone digits for E.164-ish matching", () => {
    assert.equal(normalizePhoneDigits("+31 6 1234 5678"), "31612345678");
    assert.equal(normalizePhoneDigits("06-12345678"), "0612345678");
    assert.equal(normalizePhoneDigits(""), null);
  });

  it("lookupContactByChannel accepts phone / xUserId / handle filters", async () => {
    // Empty workspace — function runs the query path without throwing on bad filters.
    const miss = await lookupContactByChannel("ws_missing_os146", {
      phone: "+31600000000",
    });
    assert.equal(miss, null);

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
