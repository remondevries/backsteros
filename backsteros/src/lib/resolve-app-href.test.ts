import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  formatResolvedAppHref,
  resolveAppHref,
} from "./resolve-app-href.ts";
import { rememberSectionEntryHrefs } from "./section-entry-store.ts";

afterEach(() => {
  rememberSectionEntryHrefs({
    inbox: null,
    communication: null,
    contacts: null,
    organizations: null,
    letters: null,
    knowledge: null,
  });
});

test("resolveAppHref expands section roots from the entry store", () => {
  rememberSectionEntryHrefs({
    inbox: "/inbox/in-1",
    communication: "/communication?channel=email",
    contacts: "/contacts/1",
    organizations: "/organizations/2",
    letters: "/letters/l-3",
    knowledge: "/spaces/note",
  });
  assert.equal(formatResolvedAppHref(resolveAppHref("/inbox")), "/inbox/in-1");
  // Communication list root only — never an item detail seed.
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/communication")),
    "/communication?channel=email",
  );
  // Explicit Everything must not be rewritten to the last channel.
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/communication?channel=all")),
    "/communication?channel=all",
  );
  rememberSectionEntryHrefs({ communication: "/communication/sup-1" });
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/communication")),
    "/communication",
  );
  // Contacts / organizations catalogs stay on the list root.
  assert.equal(formatResolvedAppHref(resolveAppHref("/contacts")), "/contacts");
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/organizations")),
    "/organizations",
  );
  assert.equal(formatResolvedAppHref(resolveAppHref("/letters")), "/letters/l-3");
  // Spaces overview stays on the list root.
  assert.equal(formatResolvedAppHref(resolveAppHref("/spaces")), "/spaces");
  assert.equal(formatResolvedAppHref(resolveAppHref("/email")), "/inbox/in-1");
  assert.match(
    formatResolvedAppHref(resolveAppHref("/journal")),
    /^\/journal\/\d{4}-\d{2}-\d{2}$/,
  );
  assert.equal(resolveAppHref("/spaces").surface, "knowledge");
  assert.equal(resolveAppHref("/inbox").surface, "inbox");
});

test("resolveAppHref leaves concrete item hrefs alone and applies defaults", () => {
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/journal/2026-01-02")),
    "/journal/2026-01-02",
  );
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/finance")),
    "/finance/dashboard",
  );
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/settings")),
    "/settings/general",
  );
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/tasks")),
    "/tasks?due=today",
  );
  assert.equal(formatResolvedAppHref(resolveAppHref("/calendar")), "/calendar");
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/inbox/in-9")),
    "/inbox/in-9",
  );
  assert.equal(formatResolvedAppHref(resolveAppHref("/letters")), "/letters");
});

test("resolveAppHref expands inbox root to the seeded first item", () => {
  rememberSectionEntryHrefs({
    inbox: "/inbox/in-1",
  });
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/inbox")),
    "/inbox/in-1",
  );
  assert.equal(resolveAppHref("/inbox").surface, "inbox");
});
