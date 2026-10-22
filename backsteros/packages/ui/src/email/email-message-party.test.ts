import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEmailMessagePartyAutoLinks,
  matchEmailMessageParty,
  resolveEmailMessagePartyAddress,
} from "./email-message-party.js";

describe("email-message-party", () => {
  it("resolves received From and sent external To", () => {
    const ours = new Set(["me@backsteros.com"]);
    assert.equal(
      resolveEmailMessagePartyAddress({
        from: "Ada <ada@example.com>",
        to: ["me@backsteros.com"],
        isSent: false,
        ourMailboxEmails: ours,
      }),
      "ada@example.com",
    );
    assert.equal(
      resolveEmailMessagePartyAddress({
        from: "me@backsteros.com",
        to: ["me@backsteros.com", "Bob <bob@example.com>"],
        isSent: true,
        ourMailboxEmails: ours,
      }),
      "bob@example.com",
    );
  });

  it("matches contact then organization by email", () => {
    const contacts = [
      {
        id: "c1",
        organizationId: "o1",
        email: "ada@example.com",
        emails: [],
      },
    ];
    const organizations = [
      {
        id: "o2",
        email: "hello@acme.com",
        emails: [],
      },
    ];
    assert.deepEqual(
      matchEmailMessageParty({
        address: "Ada <ada@example.com>",
        contacts,
        organizations,
      }),
      { contactId: "c1", organizationId: "o1" },
    );
    assert.deepEqual(
      matchEmailMessageParty({
        address: "hello@acme.com",
        contacts,
        organizations,
      }),
      { contactId: null, organizationId: "o2" },
    );
  });

  it("auto-links only messages without an existing party", () => {
    const ours = new Set(["me@backsteros.com"]);
    const next = buildEmailMessagePartyAutoLinks({
      messages: [
        {
          messageId: "m1",
          from: "ada@example.com",
          to: ["me@backsteros.com"],
        },
        {
          messageId: "m2",
          from: "bob@example.com",
          to: ["me@backsteros.com"],
        },
      ],
      ourMailboxEmails: ours,
      contacts: [
        {
          id: "c1",
          organizationId: null,
          email: "ada@example.com",
          emails: [],
        },
      ],
      organizations: [],
      existing: {
        m2: { contactId: "c-existing", organizationId: null },
      },
    });
    assert.deepEqual(next, {
      m1: { contactId: "c1", organizationId: null },
    });
  });
});
