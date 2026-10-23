import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEmailMessagePartyAutoLinks,
  matchEmailMessageParty,
  resolveEmailMessagePartyAddress,
  uniqueEmailPartyContactIds,
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

  it("auto-links contact and org matches; leaves unknown and existing alone", () => {
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
          from: "hello@acme.com",
          to: ["me@backsteros.com"],
        },
        {
          messageId: "m3",
          from: "bob@example.com",
          to: ["me@backsteros.com"],
        },
        {
          messageId: "m4",
          from: "unknown@example.com",
          to: ["me@backsteros.com"],
        },
      ],
      ourMailboxEmails: ours,
      contacts: [
        {
          id: "c1",
          organizationId: "o1",
          email: "ada@example.com",
          emails: [],
        },
      ],
      organizations: [
        {
          id: "o2",
          email: "hello@acme.com",
          emails: [],
        },
      ],
      existing: {
        m3: { contactId: "c-existing", organizationId: null },
      },
    });
    assert.deepEqual(next, {
      m1: { contactId: "c1", organizationId: "o1" },
      m2: { contactId: null, organizationId: "o2" },
    });
  });

  it("does not auto-relink after an explicit unlink (null party stored)", () => {
    const ours = new Set(["me@backsteros.com"]);
    const next = buildEmailMessagePartyAutoLinks({
      messages: [
        {
          messageId: "m1",
          from: "ada@example.com",
          to: ["me@backsteros.com"],
        },
      ],
      ourMailboxEmails: ours,
      contacts: [
        {
          id: "c1",
          organizationId: "o1",
          email: "ada@example.com",
          emails: [],
        },
      ],
      organizations: [],
      existing: {
        m1: { contactId: null, organizationId: null },
      },
    });
    assert.deepEqual(next, {});
  });

  it("uniqueEmailPartyContactIds dedupes and falls back", () => {
    assert.deepEqual(
      uniqueEmailPartyContactIds({
        m1: { contactId: "c1", organizationId: null },
        m2: { contactId: "c2", organizationId: null },
        m3: { contactId: "c1", organizationId: null },
        m4: { contactId: null, organizationId: "o1" },
      }),
      ["c1", "c2"],
    );
    assert.deepEqual(
      uniqueEmailPartyContactIds({}, "fallback"),
      ["fallback"],
    );
    assert.deepEqual(uniqueEmailPartyContactIds({}), []);
  });
});
