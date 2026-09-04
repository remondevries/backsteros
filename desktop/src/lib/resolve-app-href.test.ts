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
    contacts: null,
    organizations: null,
    letters: null,
    knowledge: null,
  });
});

test("resolveAppHref expands section roots from the entry store", () => {
  rememberSectionEntryHrefs({
    inbox: "/inbox/in-1",
    contacts: "/contacts/1",
    organizations: "/organizations/2",
    letters: "/letters/l-3",
    knowledge: "/knowledge/note",
  });
  assert.equal(formatResolvedAppHref(resolveAppHref("/inbox")), "/inbox/in-1");
  // Contacts / organizations catalogs stay on the list root.
  assert.equal(formatResolvedAppHref(resolveAppHref("/contacts")), "/contacts");
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/organizations")),
    "/organizations",
  );
  assert.equal(formatResolvedAppHref(resolveAppHref("/letters")), "/letters/l-3");
  assert.equal(
    formatResolvedAppHref(resolveAppHref("/knowledge")),
    "/knowledge/note",
  );
  assert.equal(formatResolvedAppHref(resolveAppHref("/email")), "/inbox/in-1");
  assert.match(
    formatResolvedAppHref(resolveAppHref("/journal")),
    /^\/journal\/\d{4}-\d{2}-\d{2}$/,
  );
  assert.equal(resolveAppHref("/knowledge").surface, "knowledge");
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
