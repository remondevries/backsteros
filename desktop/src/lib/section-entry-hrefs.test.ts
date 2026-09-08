import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { formatResolvedAppHref, resolveAppHref } from "./resolve-app-href";
import {
  firstContactHref,
  firstKnowledgeHref,
  firstLetterHref,
  firstOrganizationHref,
  rememberSectionEntryHrefs,
} from "./section-entry-hrefs";
import {
  isJournalDayPath,
  isRoutePathActive,
  keepAliveSidePanelSurface,
  shouldKeepAliveSidePanelSurface,
  shouldKeepAliveSurface,
} from "./shell-route-keep-alive";

afterEach(() => {
  rememberSectionEntryHrefs({
    inbox: null,
    contacts: null,
    organizations: null,
    letters: null,
    knowledge: null,
  });
});

describe("section entry hrefs", () => {
  it("picks the alpha-first contact and organization", () => {
    assert.equal(
      firstContactHref([
        { id: "2", name: "Zed", number: 2 },
        { id: "1", name: "Ann", number: 1 },
      ]),
      "/contacts/1",
    );
    assert.equal(
      firstOrganizationHref([
        { id: "2", name: "Zeta", number: 2 },
        { id: "1", name: "Acme", number: 1 },
      ]),
      "/organizations/1",
    );
  });

  it("picks the first letter and non-folder document", () => {
    assert.equal(firstLetterHref([{ number: 12 }]), "/letters/l-12");
    assert.equal(
      firstKnowledgeHref([
        { id: "folder", title: "Folder", kind: "folder" },
        { id: "doc-1", title: "Note", path: "note", kind: "document" },
      ]),
      "/knowledge/note",
    );
  });
});

describe("resolveAppHref section roots", () => {
  it("expands list+detail section roots to the seeded first entry", () => {
    rememberSectionEntryHrefs({
      inbox: "/inbox/in-1",
      contacts: "/contacts/1",
      organizations: "/organizations/2",
      letters: "/letters/l-3",
      knowledge: "/knowledge/note",
    });
    assert.equal(formatResolvedAppHref(resolveAppHref("/inbox")), "/inbox/in-1");
    // Contacts catalog is main-content (no last-contact redirect).
    assert.equal(
      formatResolvedAppHref(resolveAppHref("/contacts")),
      "/contacts",
    );
    // Organizations catalog is main-content (no first-org redirect).
    assert.equal(
      formatResolvedAppHref(resolveAppHref("/organizations")),
      "/organizations",
    );
    assert.equal(
      formatResolvedAppHref(resolveAppHref("/letters")),
      "/letters/l-3",
    );
    assert.equal(
      formatResolvedAppHref(resolveAppHref("/knowledge")),
      "/knowledge/note",
    );
  });

  it("leaves concrete item hrefs alone", () => {
    rememberSectionEntryHrefs({
      inbox: "/inbox/in-1",
      contacts: "/contacts/1",
    });
    assert.equal(
      formatResolvedAppHref(resolveAppHref("/inbox/in-9")),
      "/inbox/in-9",
    );
    assert.equal(
      formatResolvedAppHref(resolveAppHref("/contacts/8")),
      "/contacts/8",
    );
  });
});

describe("shouldKeepAliveSurface", () => {
  it("keeps list/calendar/inbox/knowledge/tasks/journal panes after first visit", () => {
    assert.equal(shouldKeepAliveSurface("calendar", "/calendar"), true);
    assert.equal(shouldKeepAliveSurface("inbox", "/inbox/in-1"), true);
    assert.equal(shouldKeepAliveSurface("knowledge", "/knowledge/note"), true);
    assert.equal(shouldKeepAliveSurface("tasks-list", "/tasks"), true);
    assert.equal(
      shouldKeepAliveSurface("journal-day", "/journal/2026-08-26"),
      true,
    );
    assert.equal(
      shouldKeepAliveSurface("journal-habits", "/journal/habits"),
      true,
    );
    assert.equal(shouldKeepAliveSurface("projects", "/projects"), true);
    assert.equal(shouldKeepAliveSurface("contacts", "/contacts/1"), true);
    assert.equal(
      shouldKeepAliveSurface("organizations", "/organizations/1"),
      true,
    );
    assert.equal(shouldKeepAliveSurface("letters", "/letters/l-1"), true);
  });

  it("does not keep-alive org-scoped lists or Outlet-only sections", () => {
    assert.equal(
      shouldKeepAliveSurface("projects", "/organizations/1/projects"),
      false,
    );
    assert.equal(
      shouldKeepAliveSurface("contacts", "/organizations/1/contacts/2"),
      false,
    );
    assert.equal(shouldKeepAliveSurface("finance", "/finance"), false);
    assert.equal(shouldKeepAliveSurface("email", "/email"), false);
  });
});

describe("shouldKeepAliveSidePanelSurface", () => {
  it("keeps calendar, inbox, knowledge, and journal panels", () => {
    assert.equal(shouldKeepAliveSidePanelSurface("calendar", "/calendar"), true);
    assert.equal(shouldKeepAliveSidePanelSurface("inbox", "/inbox/in-1"), true);
    assert.equal(
      shouldKeepAliveSidePanelSurface("knowledge", "/knowledge/note"),
      true,
    );
    assert.equal(
      shouldKeepAliveSidePanelSurface("journal-day", "/journal/2026-08-26"),
      true,
    );
    assert.equal(
      shouldKeepAliveSidePanelSurface("journal-habits", "/journal/habits"),
      true,
    );
    assert.equal(
      shouldKeepAliveSidePanelSurface("contacts", "/contacts/1"),
      true,
    );
    assert.equal(
      shouldKeepAliveSidePanelSurface("organizations", "/organizations/1"),
      true,
    );
    assert.equal(
      shouldKeepAliveSidePanelSurface("letters", "/letters/l-1"),
      true,
    );
  });

  it("keeps the tasks-list panel and the standalone projects list", () => {
    assert.equal(shouldKeepAliveSidePanelSurface("tasks-list", "/tasks"), true);
    assert.equal(shouldKeepAliveSidePanelSurface("projects", "/projects"), true);
    assert.equal(keepAliveSidePanelSurface("/tasks"), "tasks-list");
    assert.equal(keepAliveSidePanelSurface("/projects"), "projects");
  });

  it("keeps the project documents panel only on a standalone project slug", () => {
    assert.equal(
      shouldKeepAliveSidePanelSurface("projects", "/projects/CA"),
      true,
    );
    assert.equal(keepAliveSidePanelSurface("/projects/CA"), "projects");
    assert.equal(
      shouldKeepAliveSidePanelSurface(
        "projects",
        "/organizations/1/projects/CA",
      ),
      false,
    );
    assert.equal(keepAliveSidePanelSurface("/organizations/1/projects/CA"), null);
  });
});

describe("isRoutePathActive", () => {
  it("matches the section root and nested paths only", () => {
    assert.equal(isRoutePathActive("/calendar", "/calendar"), true);
    assert.equal(isRoutePathActive("/calendar/tasks", "/calendar"), true);
    assert.equal(isRoutePathActive("/contacts/2", "/calendar"), false);
    assert.equal(isRoutePathActive("/journal/2026-08-26", "/calendar"), false);
    assert.equal(isRoutePathActive("/journal/habits", "/journal/habits"), true);
    assert.equal(
      isRoutePathActive("/journal/habits/habit-1", "/journal/habits"),
      true,
    );
    assert.equal(
      isRoutePathActive("/journal/2026-08-26", "/journal/habits"),
      false,
    );
  });
});

describe("isJournalDayPath", () => {
  it("matches journal day routes and not habits", () => {
    assert.equal(isJournalDayPath("/journal"), true);
    assert.equal(isJournalDayPath("/journal/2026-08-26"), true);
    assert.equal(isJournalDayPath("/journal/habits"), false);
    assert.equal(isJournalDayPath("/calendar"), false);
  });
});
