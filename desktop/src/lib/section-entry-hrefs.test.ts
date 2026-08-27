import { afterEach, describe, expect, it } from "vitest";

import { expandNavigationHref } from "./expand-navigation-href";
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
import { ENABLE_ALL_KEEP_ALIVE } from "./journal-cpu-bisect";

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
    expect(
      firstContactHref([
        { id: "2", name: "Zed", number: 2 },
        { id: "1", name: "Ann", number: 1 },
      ]),
    ).toBe("/contacts/1");
    expect(
      firstOrganizationHref([
        { id: "2", name: "Zeta", number: 2 },
        { id: "1", name: "Acme", number: 1 },
      ]),
    ).toBe("/organizations/1");
  });

  it("picks the first letter and non-folder document", () => {
    expect(firstLetterHref([{ number: 12 }])).toBe("/letters-v2/l-12");
    expect(
      firstKnowledgeHref([
        { id: "folder", title: "Folder", kind: "folder" },
        { id: "doc-1", title: "Note", path: "note", kind: "document" },
      ]),
    ).toBe("/knowledge-v2/note");
  });
});

describe("expandNavigationHref section roots", () => {
  it("expands contacts/orgs and leaves inbox/knowledge/letters on the list root", () => {
    rememberSectionEntryHrefs({
      inbox: "/inbox/in-1",
      contacts: "/contacts/1",
      organizations: "/organizations/2",
      letters: "/letters/l-3",
      knowledge: "/knowledge/note",
    });
    expect(expandNavigationHref("/inbox")).toBe("/inbox");
    expect(expandNavigationHref("/contacts")).toBe("/contacts/1");
    expect(expandNavigationHref("/organizations")).toBe("/organizations/2");
    expect(expandNavigationHref("/letters")).toBe("/letters");
    expect(expandNavigationHref("/knowledge")).toBe("/knowledge");
  });

  it("leaves concrete item hrefs alone", () => {
    rememberSectionEntryHrefs({
      inbox: "/inbox/in-1",
      contacts: "/contacts/1",
    });
    expect(expandNavigationHref("/inbox/in-9")).toBe("/inbox/in-9");
    expect(expandNavigationHref("/contacts/8")).toBe("/contacts/8");
  });
});

describe("shouldKeepAliveSurface", () => {
  it("keeps list/calendar/inbox/knowledge/tasks/journal panes after first visit", () => {
    expect(shouldKeepAliveSurface("calendar", "/calendar")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSurface("inbox", "/inbox/in-1")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSurface("knowledge-v2", "/knowledge-v2/note")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSurface("tasks-list", "/tasks")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSurface("journal-v2", "/journal-v2/2026-08-26")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSurface("habits-v2", "/habits-v2")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSurface("journal-day", "/journal/2026-08-26")).toBe(
      false,
    );
    expect(shouldKeepAliveSurface("journal-habits", "/journal/habits")).toBe(
      false,
    );
    expect(shouldKeepAliveSurface("projects", "/projects")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSurface("contacts", "/contacts/1")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSurface("organizations", "/organizations/1")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSurface("letters-v2", "/letters-v2/l-1")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSurface("letters", "/letters/l-1")).toBe(false);
    expect(shouldKeepAliveSurface("knowledge", "/knowledge/note")).toBe(false);
  });

  it("does not keep-alive org-scoped lists or Outlet-only sections", () => {
    expect(
      shouldKeepAliveSurface("projects", "/organizations/1/projects"),
    ).toBe(false);
    expect(
      shouldKeepAliveSurface("contacts", "/organizations/1/contacts/2"),
    ).toBe(false);
    expect(shouldKeepAliveSurface("finance", "/finance")).toBe(false);
    expect(shouldKeepAliveSurface("email", "/email")).toBe(false);
  });
});

describe("shouldKeepAliveSidePanelSurface", () => {
  it("keeps calendar, inbox, knowledge, and journal panels", () => {
    expect(shouldKeepAliveSidePanelSurface("calendar", "/calendar")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSidePanelSurface("inbox", "/inbox/in-1")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(
      shouldKeepAliveSidePanelSurface("knowledge-v2", "/knowledge-v2/note"),
    ).toBe(ENABLE_ALL_KEEP_ALIVE);
    expect(
      shouldKeepAliveSidePanelSurface("journal-v2", "/journal-v2/2026-08-26"),
    ).toBe(ENABLE_ALL_KEEP_ALIVE);
    expect(
      shouldKeepAliveSidePanelSurface("habits-v2", "/habits-v2"),
    ).toBe(ENABLE_ALL_KEEP_ALIVE);
    expect(shouldKeepAliveSidePanelSurface("contacts", "/contacts/1")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(
      shouldKeepAliveSidePanelSurface("organizations", "/organizations/1"),
    ).toBe(ENABLE_ALL_KEEP_ALIVE);
    expect(shouldKeepAliveSidePanelSurface("letters-v2", "/letters-v2/l-1")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
  });

  it("keeps the tasks-list panel and the standalone projects list", () => {
    expect(shouldKeepAliveSidePanelSurface("tasks-list", "/tasks")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(shouldKeepAliveSidePanelSurface("projects", "/projects")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(keepAliveSidePanelSurface("/tasks")).toBe(
      ENABLE_ALL_KEEP_ALIVE ? "tasks-list" : null,
    );
    expect(keepAliveSidePanelSurface("/projects")).toBe(
      ENABLE_ALL_KEEP_ALIVE ? "projects" : null,
    );
  });

  it("keeps the project documents panel only on a standalone project slug", () => {
    expect(shouldKeepAliveSidePanelSurface("projects", "/projects/CA")).toBe(
      ENABLE_ALL_KEEP_ALIVE,
    );
    expect(keepAliveSidePanelSurface("/projects/CA")).toBe(
      ENABLE_ALL_KEEP_ALIVE ? "projects" : null,
    );    expect(
      shouldKeepAliveSidePanelSurface(
        "projects",
        "/organizations/1/projects/CA",
      ),
    ).toBe(false);
    expect(keepAliveSidePanelSurface("/organizations/1/projects/CA")).toBeNull();
  });
});

describe("isRoutePathActive", () => {
  it("matches the section root and nested paths only", () => {
    expect(isRoutePathActive("/calendar", "/calendar")).toBe(true);
    expect(isRoutePathActive("/calendar/tasks", "/calendar")).toBe(true);
    expect(isRoutePathActive("/contacts/2", "/calendar")).toBe(false);
    expect(isRoutePathActive("/journal/2026-08-26", "/calendar")).toBe(false);
    expect(isRoutePathActive("/habits-v2", "/habits-v2")).toBe(true);
    expect(isRoutePathActive("/habits-v2/habit-1", "/habits-v2")).toBe(true);
    expect(isRoutePathActive("/journal-v2/2026-08-26", "/habits-v2")).toBe(
      false,
    );
  });
});

describe("isJournalDayPath", () => {
  it("matches journal day routes and not habits", () => {
    expect(isJournalDayPath("/journal")).toBe(true);
    expect(isJournalDayPath("/journal/2026-08-26")).toBe(true);
    expect(isJournalDayPath("/journal/habits")).toBe(false);
    expect(isJournalDayPath("/calendar")).toBe(false);
  });
});
