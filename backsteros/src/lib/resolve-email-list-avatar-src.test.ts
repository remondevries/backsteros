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
