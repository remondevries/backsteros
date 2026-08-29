import { afterEach, describe, expect, it } from "vitest";

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
    expect(firstLetterHref([{ number: 12 }])).toBe("/letters/l-12");
    expect(
      firstKnowledgeHref([
        { id: "folder", title: "Folder", kind: "folder" },
        { id: "doc-1", title: "Note", path: "note", kind: "document" },
      ]),
    ).toBe("/knowledge/note");
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
    expect(formatResolvedAppHref(resolveAppHref("/inbox"))).toBe("/inbox/in-1");
    // Contacts catalog is main-content (no last-contact redirect).
    expect(formatResolvedAppHref(resolveAppHref("/contacts"))).toBe(
      "/contacts",
    );
    expect(formatResolvedAppHref(resolveAppHref("/organizations"))).toBe(
      "/organizations/2",
    );
    expect(formatResolvedAppHref(resolveAppHref("/letters"))).toBe(
      "/letters/l-3",
    );
    expect(formatResolvedAppHref(resolveAppHref("/knowledge"))).toBe(
      "/knowledge/note",
    );
  });

  it("leaves concrete item hrefs alone", () => {
    rememberSectionEntryHrefs({
      inbox: "/inbox/in-1",
      contacts: "/contacts/1",
    });
    expect(formatResolvedAppHref(resolveAppHref("/inbox/in-9"))).toBe(
      "/inbox/in-9",
    );
    expect(formatResolvedAppHref(resolveAppHref("/contacts/8"))).toBe(
      "/contacts/8",
    );
  });
});

describe("shouldKeepAliveSurface", () => {
  it("keeps list/calendar/inbox/knowledge/tasks/journal panes after first visit", () => {
    expect(shouldKeepAliveSurface("calendar", "/calendar")).toBe(true);
    expect(shouldKeepAliveSurface("inbox", "/inbox/in-1")).toBe(true);
    expect(shouldKeepAliveSurface("knowledge", "/knowledge/note")).toBe(true);
    expect(shouldKeepAliveSurface("tasks-list", "/tasks")).toBe(true);
    expect(shouldKeepAliveSurface("journal-day", "/journal/2026-08-26")).toBe(
      true,
    );
    expect(shouldKeepAliveSurface("journal-habits", "/journal/habits")).toBe(
      true,
    );
    expect(shouldKeepAliveSurface("projects", "/projects")).toBe(true);
    expect(shouldKeepAliveSurface("contacts", "/contacts/1")).toBe(true);
    expect(shouldKeepAliveSurface("organizations", "/organizations/1")).toBe(
      true,
    );
    expect(shouldKeepAliveSurface("letters", "/letters/l-1")).toBe(true);
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
    expect(shouldKeepAliveSidePanelSurface("calendar", "/calendar")).toBe(true);
    expect(shouldKeepAliveSidePanelSurface("inbox", "/inbox/in-1")).toBe(true);
    expect(
      shouldKeepAliveSidePanelSurface("knowledge", "/knowledge/note"),
    ).toBe(true);
    expect(
      shouldKeepAliveSidePanelSurface("journal-day", "/journal/2026-08-26"),
    ).toBe(true);
    expect(
      shouldKeepAliveSidePanelSurface("journal-habits", "/journal/habits"),
    ).toBe(true);
    expect(shouldKeepAliveSidePanelSurface("contacts", "/contacts/1")).toBe(
      true,
    );
    expect(
      shouldKeepAliveSidePanelSurface("organizations", "/organizations/1"),
    ).toBe(true);
    expect(shouldKeepAliveSidePanelSurface("letters", "/letters/l-1")).toBe(
      true,
    );
  });

  it("keeps the tasks-list panel and the standalone projects list", () => {
    expect(shouldKeepAliveSidePanelSurface("tasks-list", "/tasks")).toBe(true);
    expect(shouldKeepAliveSidePanelSurface("projects", "/projects")).toBe(true);
    expect(keepAliveSidePanelSurface("/tasks")).toBe("tasks-list");
    expect(keepAliveSidePanelSurface("/projects")).toBe("projects");
  });

  it("keeps the project documents panel only on a standalone project slug", () => {
    expect(shouldKeepAliveSidePanelSurface("projects", "/projects/CA")).toBe(
      true,
    );
    expect(keepAliveSidePanelSurface("/projects/CA")).toBe("projects");
    expect(
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
    expect(isRoutePathActive("/journal/habits", "/journal/habits")).toBe(true);
    expect(isRoutePathActive("/journal/habits/habit-1", "/journal/habits")).toBe(
      true,
    );
    expect(isRoutePathActive("/journal/2026-08-26", "/journal/habits")).toBe(
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
