import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_MENTION_CATALOG } from "./empty-catalog.js";
import { filterCatalogForTokens } from "./filter-catalog-for-tokens.js";
import { parseMentionToken } from "./mention-tokens.js";
import type { MentionCatalog, MentionItem } from "./mention-menu-types.js";
import {
  contactMatchesMentionRef,
  resolveMentionCatalogContact,
} from "./resolve-catalog-entry.js";
import { buildMentionToken, resolveMentionHref, rewriteContactMentionTokensToDisplayIds } from "./tokens.js";

const contact = {
  id: "contact-uuid",
  key: "newcon71_08128be1",
  number: 12,
  displayId: "C-12",
  name: "Simone Bakker",
  firstName: "Simone",
  lastName: "Bakker",
  email: null,
  emails: null,
  phone: null,
  phones: null,
  title: null,
  summary: null,
  address: null,
  city: null,
  postalCode: null,
  region: null,
  country: null,
  socialAccounts: null,
  avatarStorageKey: null,
  avatarUpdatedAt: 0,
  avatarSrc: null,
  organizationId: null,
  organizationKey: null,
  organizationName: null,
  organizationAvatarSrc: null,
};

const catalog: MentionCatalog = {
  ...EMPTY_MENTION_CATALOG,
  contacts: [contact],
};

const mentionItem: MentionItem = {
  kind: "contact",
  id: contact.id,
  key: contact.key,
  number: contact.number,
  displayId: contact.displayId,
  name: contact.name,
  title: null,
  organizationName: null,
  avatarStorageKey: null,
  avatarUpdatedAt: 0,
};

test("buildMentionToken prefers contact display id", () => {
  assert.equal(buildMentionToken(mentionItem), "[@contact:C-12]");
});

test("buildMentionToken falls back to key when display id is missing", () => {
  assert.equal(
    buildMentionToken({ ...mentionItem, displayId: null, number: null }),
    "[@contact:newcon71_08128be1]",
  );
});

test("buildMentionToken prefers number over slug displayId", () => {
  assert.equal(
    buildMentionToken({
      ...mentionItem,
      displayId: "newcon71_08128be1",
      number: 17,
    }),
    "[@contact:C-17]",
  );
});

test("contactMatchesMentionRef accepts C-N, legacy key, and id", () => {
  assert.equal(contactMatchesMentionRef(contact, "C-12"), true);
  assert.equal(contactMatchesMentionRef(contact, "c-12"), true);
  assert.equal(contactMatchesMentionRef(contact, "newcon71_08128be1"), true);
  assert.equal(contactMatchesMentionRef(contact, "contact-uuid"), true);
  assert.equal(contactMatchesMentionRef(contact, "C-99"), false);
});

test("resolveMentionCatalogContact resolves display id and legacy key", () => {
  const byDisplay = parseMentionToken("[@contact:C-12]");
  const byKey = parseMentionToken("[@contact:newcon71_08128be1]");
  assert.ok(byDisplay);
  assert.ok(byKey);
  assert.equal(resolveMentionCatalogContact(byDisplay, catalog)?.id, contact.id);
  assert.equal(resolveMentionCatalogContact(byKey, catalog)?.id, contact.id);
});

test("resolveMentionHref works for C-N tokens", () => {
  const parsed = parseMentionToken("[@contact:C-12]");
  assert.ok(parsed);
  assert.equal(resolveMentionHref(parsed, catalog), "/contacts/12");
});

test("filterCatalogForTokens keeps contacts matched by display id", () => {
  const parsed = parseMentionToken("[@contact:C-12]");
  assert.ok(parsed);
  const filtered = filterCatalogForTokens(catalog, [parsed]);
  assert.equal(filtered.contacts.length, 1);
  assert.equal(filtered.contacts[0]?.id, contact.id);
});

test("rewriteContactMentionTokensToDisplayIds upgrades legacy keys", () => {
  const input =
    "Idea from [@contact:newcon71_08128be1] and [@contact:NC3] leftover.";
  const withNc3: MentionCatalog = {
    ...catalog,
    contacts: [
      contact,
      {
        ...contact,
        id: "nc3-id",
        key: "NC3",
        number: 3,
        displayId: "C-3",
        name: "Someone",
      },
    ],
  };
  assert.equal(
    rewriteContactMentionTokensToDisplayIds(input, withNc3),
    "Idea from [@contact:C-12] and [@contact:C-3] leftover.",
  );
});

test("rewriteContactMentionTokensToDisplayIds leaves unknown keys alone", () => {
  assert.equal(
    rewriteContactMentionTokensToDisplayIds(
      "See [@contact:missing-person]",
      catalog,
    ),
    "See [@contact:missing-person]",
  );
});
