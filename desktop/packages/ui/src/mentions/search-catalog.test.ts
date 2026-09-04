import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_MENTION_CATALOG } from "./empty-catalog.js";
import { buildMentionSections } from "./search-catalog.js";
import type { MentionCatalog } from "./mention-menu-types.js";

const catalog: MentionCatalog = {
  ...EMPTY_MENTION_CATALOG,
  contacts: [
    {
      id: "c1",
      key: "simone-bakker",
      number: 12,
      displayId: "C-12",
      name: "Simone Bakker",
      firstName: "Simone",
      lastName: "Bakker",
      email: "simone@example.com",
      emails: null,
      phone: null,
      phones: null,
      title: "Designer",
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
      organizationId: "o1",
      organizationKey: "acme",
      organizationName: "Acme",
      organizationAvatarSrc: null,
    },
  ],
  organizations: [
    {
      id: "o1",
      key: "acme",
      number: 3,
      displayId: "O-3",
      name: "Acme Corp",
      email: null,
      summary: null,
      avatarStorageKey: null,
      avatarUpdatedAt: 0,
      avatarSrc: null,
    },
  ],
};

test("buildMentionSections finds contacts by first name", () => {
  const sections = buildMentionSections(catalog, "Simone");
  const contactSection = sections.find((section) => section.kind === "contact");
  assert.ok(contactSection);
  assert.equal(contactSection.items.length, 1);
  assert.equal(contactSection.items[0]?.kind, "contact");
  if (contactSection.items[0]?.kind === "contact") {
    assert.equal(contactSection.items[0].name, "Simone Bakker");
    assert.equal(contactSection.items[0].displayId, "C-12");
  }
});

test("buildMentionSections finds contacts by display id", () => {
  const sections = buildMentionSections(catalog, "C-12");
  const contactSection = sections.find((section) => section.kind === "contact");
  assert.ok(contactSection);
  assert.equal(contactSection.items.length, 1);
  assert.equal(contactSection.items[0]?.kind, "contact");
});

test("buildMentionSections finds organizations by name", () => {
  const sections = buildMentionSections(catalog, "Acme");
  const orgSection = sections.find((section) => section.kind === "organization");
  assert.ok(orgSection);
  assert.equal(orgSection.items.length, 1);
  assert.equal(orgSection.items[0]?.kind, "organization");
  if (orgSection.items[0]?.kind === "organization") {
    assert.equal(orgSection.items[0].name, "Acme Corp");
  }
});
