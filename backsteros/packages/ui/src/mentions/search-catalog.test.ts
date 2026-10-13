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

test("buildMentionSections omits completed canceled duplicated projects", () => {
  const withProjects: MentionCatalog = {
    ...catalog,
    projects: [
      {
        id: "p1",
        key: "OS",
        name: "Open Sys",
        color: null,
        icon: null,
        type: "codebase",
        summary: null,
        status: "active",
        area: null,
      },
      {
        id: "p2",
        key: "OLD",
        name: "Old Sys",
        color: null,
        icon: null,
        type: "codebase",
        summary: null,
        status: "completed",
        area: null,
      },
    ],
  };
  const sections = buildMentionSections(withProjects, "Sys");
  const projectSection = sections.find((section) => section.kind === "project");
  assert.ok(projectSection);
  assert.equal(projectSection.items.length, 1);
  assert.equal(projectSection.items[0]?.kind, "project");
  if (projectSection.items[0]?.kind === "project") {
    assert.equal(projectSection.items[0].key, "OS");
  }
});
