import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyCommunicationEmailPartyLink,
  resolveCommunicationEmailParty,
  type CommunicationEmailActiveParty,
  type ResolveCommunicationEmailPartyInput,
} from "./communication-email-party.js";

function party(
  partial: Partial<CommunicationEmailActiveParty> &
    Pick<CommunicationEmailActiveParty, "messageId">,
): CommunicationEmailActiveParty {
  return {
    address: null,
    displayName: null,
    contactId: null,
    organizationId: null,
    ...partial,
  };
}

function input(
  partial: Partial<ResolveCommunicationEmailPartyInput>,
): ResolveCommunicationEmailPartyInput {
  return {
    isComposing: false,
    composeParty: { contactId: null, organizationId: null },
    composePartyEmail: null,
    activeParty: null,
    selectedParty: null,
    messageParties: {},
    fallbackPartyEmail: null,
    contacts: [],
    organizations: [],
    ...partial,
  };
}

describe("resolveCommunicationEmailParty", () => {
  it("returns the compose party in compose mode", () => {
    const resolved = resolveCommunicationEmailParty(
      input({
        isComposing: true,
        composeParty: { contactId: "c1", organizationId: "o1" },
        composePartyEmail: "ada@example.com",
        activeParty: party({ messageId: "m1", contactId: "other" }),
      }),
    );
    assert.deepEqual(resolved.selectedMessageParty, {
      contactId: "c1",
      organizationId: "o1",
    });
    assert.equal(resolved.emailPartyEmail, "ada@example.com");
    assert.equal(resolved.focusParty, null);
  });

  it("keeps a newly created org with no emails linked", () => {
    const resolved = resolveCommunicationEmailParty(
      input({
        activeParty: party({ messageId: "m1", address: "new@acme.com" }),
        messageParties: { m1: { contactId: null, organizationId: "o-new" } },
        organizations: [{ id: "o-new", email: null, emails: [] }],
      }),
    );
    assert.deepEqual(resolved.selectedMessageParty, {
      contactId: null,
      organizationId: "o-new",
    });
  });

  it("keeps an explicit unlink even when From matches a contact", () => {
    const resolved = resolveCommunicationEmailParty(
      input({
        activeParty: party({ messageId: "m1", address: "ada@example.com" }),
        messageParties: { m1: { contactId: null, organizationId: null } },
        contacts: [{ id: "c-ada", email: "ada@example.com", emails: [] }],
      }),
    );
    assert.deepEqual(resolved.selectedMessageParty, {
      contactId: null,
      organizationId: null,
    });
  });

  it("soft-matches From when the stored party is a mismatch", () => {
    const resolved = resolveCommunicationEmailParty(
      input({
        activeParty: party({ messageId: "m1", address: "bob@example.com" }),
        messageParties: { m1: { contactId: null, organizationId: "o-billing" } },
        contacts: [
          {
            id: "c-bob",
            organizationId: "o-bob",
            email: "bob@example.com",
            emails: [],
          },
        ],
        organizations: [
          { id: "o-billing", email: "billing@acme.com", emails: [] },
        ],
      }),
    );
    assert.deepEqual(resolved.selectedMessageParty, {
      contactId: "c-bob",
      organizationId: "o-bob",
    });
  });

  it("keeps a manual org when From matches nothing", () => {
    const resolved = resolveCommunicationEmailParty(
      input({
        activeParty: party({ messageId: "m1", address: "stranger@x.com" }),
        messageParties: { m1: { contactId: null, organizationId: "o-manual" } },
        organizations: [
          { id: "o-manual", email: "billing@acme.com", emails: [] },
        ],
      }),
    );
    assert.deepEqual(resolved.selectedMessageParty, {
      contactId: null,
      organizationId: "o-manual",
    });
  });

  it("follows the selected message and falls back to the list party email", () => {
    const resolved = resolveCommunicationEmailParty(
      input({
        activeParty: party({ messageId: "latest", contactId: "c-latest" }),
        selectedParty: party({ messageId: "older", contactId: "c-older" }),
        fallbackPartyEmail: "list@example.com",
      }),
    );
    assert.equal(resolved.focusParty?.messageId, "older");
    assert.deepEqual(resolved.selectedMessageParty, {
      contactId: "c-older",
      organizationId: null,
    });
    assert.deepEqual(resolved.latestMessageParty, {
      contactId: "c-latest",
      organizationId: null,
    });
    assert.equal(resolved.emailPartyEmail, "list@example.com");
  });
});

describe("applyCommunicationEmailPartyLink", () => {
  it("seeds a party when none is focused yet", () => {
    assert.deepEqual(
      applyCommunicationEmailPartyLink(null, "m1", {
        contactId: null,
        organizationId: "o1",
      }),
      {
        messageId: "m1",
        address: null,
        displayName: null,
        contactId: null,
        organizationId: "o1",
      },
    );
  });

  it("only patches the matching message", () => {
    const prev = party({ messageId: "m2", contactId: "c2" });
    assert.equal(
      applyCommunicationEmailPartyLink(prev, "m1", {
        contactId: "c1",
        organizationId: null,
      }),
      prev,
    );
  });
});
