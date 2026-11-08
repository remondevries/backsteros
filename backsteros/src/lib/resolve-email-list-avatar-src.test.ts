import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInboxEmailListItem } from "@backsteros/ui";

import { resolveEmailListAvatarSrc } from "./resolve-email-list-avatar-src.ts";

describe("resolveEmailListAvatarSrc", () => {
  it("falls back to Brandfetch from the party email domain", () => {
    const item = buildInboxEmailListItem({
      inboxId: "box",
      messageId: "m1",
      title: "Hello",
      from: "Google <alerts@google.com>",
      status: "triage",
    });
    // partyLabel comes from from/contact — ensure party email is present
    const withParty = {
      ...item,
      partyLabel: "Google (alerts@google.com)",
    };
    const src = resolveEmailListAvatarSrc({
      item: withParty,
      contacts: [],
      organizations: [],
      contactAvatarSrc: {},
      organizationUploadedSrc: {},
      brandfetchClientId: "client_test",
    });
    assert.ok(src?.includes("google.com"));
  });

  it("prefers the party-line contact over a filed mailbox contact", () => {
    const item = {
      ...buildInboxEmailListItem({
        inboxId: "box",
        messageId: "m1",
        title: "Hello",
        from: "Eric Koops <eric@example.com>",
        status: "triage",
        contactId: "remon",
        contactName: "Remon de Vries",
      }),
      partyLabel: "Eric Koops (eric@example.com)",
    };
    const src = resolveEmailListAvatarSrc({
      item,
      contacts: [
        {
          id: "remon",
          name: "Remon de Vries",
          email: "remon@lemo-design.nl",
          avatarSrc: "https://cdn.example/remon.png",
        },
        {
          id: "eric",
          name: "Eric Koops",
          email: "eric@example.com",
          avatarSrc: "https://cdn.example/eric.png",
        },
      ],
      organizations: [],
      contactAvatarSrc: {},
      organizationUploadedSrc: {},
      brandfetchClientId: null,
      mailboxContactIds: new Set(["remon"]),
    });
    assert.equal(src, "https://cdn.example/eric.png");
  });

  it("uses the counterparty contact avatar when party-label email is our outbound From", () => {
    const item = {
      ...buildInboxEmailListItem({
        inboxId: "box",
        messageId: "m1",
        title: "Hello",
        from: "Remon de Vries <remon@lemo-design.com>",
        status: "on_hold",
        contactId: "ewout",
        contactName: "Ewout Bos",
      }),
      // Buggy label shape: name is counterparty, email is our mailbox From.
      partyLabel: "Ewout Bos (remon@lemo-design.com)",
    };
    const src = resolveEmailListAvatarSrc({
      item,
      contacts: [
        {
          id: "remon",
          name: "Remon de Vries",
          email: "remon@lemo-design.com",
          avatarSrc: "https://cdn.example/remon.png",
        },
        {
          id: "ewout",
          name: "Ewout Bos",
          email: "ewout.bos@gmail.com",
          avatarSrc: "https://cdn.example/ewout.png",
        },
      ],
      organizations: [],
      contactAvatarSrc: {},
      organizationUploadedSrc: {},
      brandfetchClientId: null,
      mailboxContactIds: new Set(["remon"]),
    });
    assert.equal(src, "https://cdn.example/ewout.png");
  });

  it("prefers a filed organization Brandfetch website over domain fallback", () => {
    const item = {
      ...buildInboxEmailListItem({
        inboxId: "box",
        messageId: "m1",
        title: "Hello",
        status: "triage",
        organizationId: "org-1",
      }),
      partyLabel: "Other (other@elsewhere.test)",
    };
    const src = resolveEmailListAvatarSrc({
      item,
      contacts: [],
      organizations: [
        {
          id: "org-1",
          website: "https://google.com",
        },
      ],
      contactAvatarSrc: {},
      organizationUploadedSrc: {},
      brandfetchClientId: "client_test",
    });
    assert.ok(src?.includes("google.com"));
  });
});
