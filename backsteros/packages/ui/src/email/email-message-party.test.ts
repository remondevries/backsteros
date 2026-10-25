import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEmailMessagePartyAutoLinks,
  classifyStoredEmailMessageParty,
  matchEmailMessageParty,
  resolveEmailMessagePartyAddress,
  uniqueEmailPartyContactIds,
} from "./email-message-party.js";

describe("email-message-party", () => {
  it("always resolves the From address (including when From is our mailbox)", () => {
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
    // Sent mail still uses From — never switches to To.
    assert.equal(
      resolveEmailMessagePartyAddress({
        from: "me@backsteros.com",
        to: ["Bob <bob@example.com>"],
        isSent: true,
        ourMailboxEmails: ours,
      }),
      "me@backsteros.com",
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

  it("prefers primary email owner when another contact has the address as other", () => {
    const contacts = [
      {
        id: "theis-jan",
        organizationId: "o-goudswaard",
        email: "info@goudswaardadvies.nl",
        emails: [{ address: "m.blom@schotpoort.nl" }],
      },
      {
        id: "marcel",
        organizationId: "o-schotpoort",
        email: "m.blom@schotpoort.nl",
        emails: [],
      },
    ];
    assert.deepEqual(
      matchEmailMessageParty({
        address: "Marcel Blom <m.blom@schotpoort.nl>",
        contacts,
        organizations: [],
      }),
      { contactId: "marcel", organizationId: "o-schotpoort" },
    );
    assert.equal(
      classifyStoredEmailMessageParty({
        party: { contactId: "theis-jan", organizationId: "o-goudswaard" },
        address: "m.blom@schotpoort.nl",
        contacts,
        organizations: [],
      }),
      "mismatch",
    );
  });

  it("auto-links each From independently in a multi-party thread", () => {
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
        {
          id: "c2",
          organizationId: "o1",
          email: "bob@example.com",
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
      existing: {},
    });
    assert.deepEqual(next, {
      m1: { contactId: "c1", organizationId: "o1" },
      m2: { contactId: null, organizationId: "o2" },
      m3: { contactId: "c2", organizationId: "o1" },
    });
  });

  it("replaces a stale thread-seeded party that does not match From", () => {
    const ours = new Set(["me@backsteros.com"]);
    const contacts = [
      {
        id: "c-ada",
        organizationId: "o1",
        email: "ada@example.com",
        emails: [],
      },
      {
        id: "c-bob",
        organizationId: "o1",
        email: "bob@example.com",
        emails: [],
      },
    ];
    assert.equal(
      classifyStoredEmailMessageParty({
        party: { contactId: "c-ada", organizationId: "o1" },
        address: "bob@example.com",
        contacts,
        organizations: [],
      }),
      "mismatch",
    );
    const next = buildEmailMessagePartyAutoLinks({
      messages: [
        {
          messageId: "m-latest",
          from: "bob@example.com",
          to: ["me@backsteros.com"],
        },
        {
          messageId: "m-earlier",
          from: "ada@example.com",
          to: ["me@backsteros.com"],
        },
      ],
      ourMailboxEmails: ours,
      contacts,
      organizations: [],
      existing: {
        "m-latest": { contactId: "c-ada", organizationId: "o1" },
      },
    });
    assert.deepEqual(next, {
      "m-latest": { contactId: "c-bob", organizationId: "o1" },
      "m-earlier": { contactId: "c-ada", organizationId: "o1" },
    });
  });

  it("keeps a manual org when From matches no entity (do not wipe user pick)", () => {
    const ours = new Set(["me@backsteros.com"]);
    const next = buildEmailMessagePartyAutoLinks({
      messages: [
        {
          messageId: "m1",
          from: "unknown@example.com",
          to: ["me@backsteros.com"],
        },
      ],
      ourMailboxEmails: ours,
      contacts: [
        {
          id: "c-ada",
          organizationId: "o1",
          email: "ada@example.com",
          emails: [],
        },
      ],
      organizations: [
        { id: "o-manual", email: "billing@acme.com", emails: [] },
      ],
      existing: {
        m1: { contactId: null, organizationId: "o-manual" },
      },
    });
    // No From match and no primary-owner conflict — leave the manual org.
    assert.deepEqual(next, {});
  });

  it("refiles a wrong contact when another contact owns From as primary", () => {
    const ours = new Set(["me@backsteros.com"]);
    const next = buildEmailMessagePartyAutoLinks({
      messages: [
        {
          messageId: "m1",
          from: "bob@example.com",
          to: ["me@backsteros.com"],
        },
      ],
      ourMailboxEmails: ours,
      contacts: [
        {
          id: "c-ada",
          organizationId: "o1",
          email: "ada@example.com",
          emails: [{ address: "bob@example.com" }],
        },
        {
          id: "c-bob",
          organizationId: "o1",
          email: "bob@example.com",
          emails: [],
        },
      ],
      organizations: [],
      existing: {
        m1: { contactId: "c-ada", organizationId: "o1" },
      },
    });
    assert.deepEqual(next, {
      m1: { contactId: "c-bob", organizationId: "o1" },
    });
  });

  it("treats an empty newly created org as unknown (keep manual link)", () => {
    assert.equal(
      classifyStoredEmailMessageParty({
        party: { contactId: null, organizationId: "o-new" },
        address: "stranger@example.com",
        contacts: [],
        organizations: [{ id: "o-new", email: null, emails: [] }],
      }),
      "unknown",
    );
    assert.equal(
      classifyStoredEmailMessageParty({
        party: { contactId: null, organizationId: "o-billing" },
        address: "stranger@example.com",
        contacts: [],
        organizations: [
          { id: "o-billing", email: "billing@acme.com", emails: [] },
        ],
      }),
      "mismatch",
    );
  });

  it("keeps a matching stored party and leaves directory-unknown alone", () => {
    const ours = new Set(["me@backsteros.com"]);
    const contacts = [
      {
        id: "c1",
        organizationId: "o1",
        email: "ada@example.com",
        emails: [],
      },
    ];
    assert.equal(
      classifyStoredEmailMessageParty({
        party: { contactId: "c1", organizationId: "o1" },
        address: "ada@example.com",
        contacts,
        organizations: [],
      }),
      "match",
    );
    assert.equal(
      classifyStoredEmailMessageParty({
        party: { contactId: "c-missing", organizationId: null },
        address: "ada@example.com",
        contacts,
        organizations: [],
      }),
      "unknown",
    );
    const next = buildEmailMessagePartyAutoLinks({
      messages: [
        {
          messageId: "m1",
          from: "ada@example.com",
          to: ["me@backsteros.com"],
        },
        {
          messageId: "m2",
          from: "other@example.com",
          to: ["me@backsteros.com"],
        },
      ],
      ourMailboxEmails: ours,
      contacts,
      organizations: [],
      existing: {
        m1: { contactId: "c1", organizationId: "o1" },
        m2: { contactId: "c-missing", organizationId: null },
      },
    });
    assert.deepEqual(next, {});
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

  it("OS-136: always links From — sent Remon reply files to Remon, not To", () => {
    const ours = new Set(["remon@lemo-design.nl", "info@goudswaardadvies.nl"]);
    const contacts = [
      {
        id: "theis-jan",
        organizationId: "o-goudswaard",
        email: "info@goudswaardadvies.nl",
        emails: [{ address: "m.blom@schotpoort.nl" }],
      },
      {
        id: "marcel",
        organizationId: "o-schotpoort",
        email: "m.blom@schotpoort.nl",
        emails: [],
      },
      {
        id: "remon",
        organizationId: "o-lemo",
        email: "remon@lemo-design.nl",
        emails: [],
      },
    ];
    const organizations = [
      {
        id: "o-goudswaard",
        email: "info@goudswaardadvies.nl",
        emails: [],
      },
      {
        id: "o-schotpoort",
        email: "hello@schotpoort.nl",
        emails: [],
      },
      {
        id: "o-lemo",
        email: "info@lemo-design.nl",
        emails: [],
      },
    ];

    const messages = [
      {
        messageId: "msg-remon-reply",
        from: "Remon | Lemo-Design <remon@lemo-design.nl>",
        to: [
          "info@goudswaardadvies.nl",
          "Marcel Blom | Schotpoort <m.blom@schotpoort.nl>",
        ],
      },
      {
        messageId: "msg-marcel",
        from: "Marcel Blom | Schotpoort Transport Groep <m.blom@schotpoort.nl>",
        to: ["info@goudswaardadvies.nl"],
      },
      {
        messageId: "msg-unknown",
        from: "vendor@example.com",
        to: ["remon@lemo-design.nl"],
      },
    ];

    const fresh = buildEmailMessagePartyAutoLinks({
      messages,
      ourMailboxEmails: ours,
      contacts,
      organizations,
      existing: {},
    });
    assert.deepEqual(fresh, {
      "msg-remon-reply": { contactId: "remon", organizationId: "o-lemo" },
      "msg-marcel": { contactId: "marcel", organizationId: "o-schotpoort" },
    });
    assert.equal(fresh["msg-unknown"], undefined);

    // Stale Theis-Jan on Remon’s From and Marcel’s From — refile by From.
    const corrected = buildEmailMessagePartyAutoLinks({
      messages,
      ourMailboxEmails: ours,
      contacts,
      organizations,
      existing: {
        "msg-remon-reply": {
          contactId: "theis-jan",
          organizationId: "o-goudswaard",
        },
        "msg-marcel": {
          contactId: "theis-jan",
          organizationId: "o-goudswaard",
        },
      },
    });
    assert.deepEqual(corrected, {
      "msg-remon-reply": { contactId: "remon", organizationId: "o-lemo" },
      "msg-marcel": { contactId: "marcel", organizationId: "o-schotpoort" },
    });
  });

  it("OS-136: manual org on unmatched From is kept", () => {
    const ours = new Set(["remon@lemo-design.nl"]);
    const next = buildEmailMessagePartyAutoLinks({
      messages: [
        {
          messageId: "inbound-unknown",
          from: "stranger@example.com",
          to: ["remon@lemo-design.nl"],
        },
      ],
      ourMailboxEmails: ours,
      contacts: [
        {
          id: "remon",
          organizationId: "o-lemo",
          email: "remon@lemo-design.nl",
          emails: [],
        },
      ],
      organizations: [
        { id: "o-lemo", email: "info@lemo-design.nl", emails: [] },
      ],
      existing: {
        "inbound-unknown": {
          contactId: null,
          organizationId: "o-lemo",
        },
      },
    });
    assert.deepEqual(next, {});
  });
});
